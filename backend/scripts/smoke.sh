#!/usr/bin/env bash
# Smoke test: starts dist/volt-backend on a free port with a temporary data
# dir and checks the core endpoints with curl. Exits non-zero on failure.
# Build first (scripts/build.sh) or pass --build.
set -u

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BIN="$BACKEND_DIR/dist/volt-backend"

if [ "${1:-}" = "--build" ]; then
    "$BACKEND_DIR/scripts/build.sh" || exit 1
fi
if [ ! -x "$BIN" ]; then
    echo "smoke: $BIN missing - run scripts/build.sh first" >&2
    exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "smoke: curl is required" >&2; exit 1; }

DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/volt-smoke.XXXXXX")
LOG="$DATA_DIR.log"
TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
PID=""
FAILURES=0
CHECKS=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    rm -rf "$DATA_DIR" "$LOG" "$DATA_DIR.out"
}
trap cleanup EXIT

free_port() {
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
    else
        echo $(( 20000 + RANDOM % 40000 ))
    fi
}

start_backend() {
    PORT=$(free_port)
    "$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR" --enable-test-routes >"$DATA_DIR.out" 2>>"$LOG" &
    PID=$!
    for _ in $(seq 1 100); do
        if grep -q "VOLT_BACKEND_READY port=$PORT" "$DATA_DIR.out" 2>/dev/null; then
            return 0
        fi
        if ! kill -0 "$PID" 2>/dev/null; then break; fi
        sleep 0.05
    done
    echo "smoke: backend did not report ready" >&2
    cat "$LOG" >&2
    exit 1
}

stop_backend() {
    kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; PID=""
}

# req METHOD PATH [BODY] [notoken] -> sets STATUS and BODY
req() {
    local method=$1 path=$2 data=${3:-} auth=${4:-token}
    local args=(-s -o "$DATA_DIR.body" -w '%{http_code}' -X "$method")
    if [ "$auth" = "token" ]; then args+=(-H "X-Volt-Token: $TOKEN"); fi
    if [ -n "$data" ]; then args+=(-H "Content-Type: application/json" --data-binary "$data"); fi
    STATUS=$(curl "${args[@]}" "http://127.0.0.1:$PORT$path")
    BODY=$(cat "$DATA_DIR.body" 2>/dev/null)
    rm -f "$DATA_DIR.body"
}

check() { # check NAME CONDITION...
    local name=$1; shift
    CHECKS=$((CHECKS + 1))
    if "$@"; then
        echo "ok    $name"
    else
        FAILURES=$((FAILURES + 1))
        echo "FAIL  $name (status $STATUS, body $BODY)"
    fi
}
status_is() { [ "$STATUS" = "$1" ]; }
body_has() { case "$BODY" in *"$1"*) return 0 ;; *) return 1 ;; esac; }
status_and_body() { status_is "$1" && body_has "$2"; }
json_field() { # json_field KEY -> first "KEY":"value" string in BODY
    printf '%s' "$BODY" | grep -o "\"$1\":\"[^\"]*\"" | head -n 1 | sed "s/^\"$1\":\"\(.*\)\"$/\1/"
}

# poll_job ID STATE -> polls GET /api/jobs/ID (max ~5 s) until state is STATE
poll_job() {
    for _ in $(seq 1 100); do
        req GET "/api/jobs/$1"
        if body_has "\"state\":\"$2\""; then return 0; fi
        if ! body_has '"state":"running"'; then return 1; fi
        sleep 0.05
    done
    return 1
}

start_backend
echo "smoke: backend on port $PORT, data dir $DATA_DIR"

# --- health and auth
req GET /api/health "" notoken
check "health without token"            status_and_body 200 '"status":"ok"'
req GET /api/settings "" notoken
check "settings without token -> 401"   status_and_body 401 '"error":{"code":"unauthorized"'
STATUS_SAVED=$TOKEN; TOKEN=wrong; req GET /api/settings; TOKEN=$STATUS_SAVED
check "settings wrong token -> 401"     status_is 401
req GET /api/settings
check "settings with token"             status_and_body 200 '"downloadThreads":6'

# --- settings
req PATCH /api/settings '{"memoryMb": 6144, "theme": "dark", "javaPath": "/opt/java/bin/java"}'
check "PATCH settings"                  status_and_body 200 '"memoryMb":6144'
check "PATCH keeps other keys"          body_has '"language":"de"'
req PATCH /api/settings '{"memoryMb": "lots"}'
check "PATCH invalid value -> 400"      status_and_body 400 '"code":"bad_request"'
req PATCH /api/settings '{"nope": 1}'
check "PATCH unknown key -> 400"        status_and_body 400 '"code":"bad_request"'
check "settings.json written"           grep -q '"memoryMb": 6144' "$DATA_DIR/settings.json"
stop_backend
start_backend
req GET /api/settings
check "settings persist across restart" status_and_body 200 '"theme":"dark"'
check "javaPath persisted"              body_has '"javaPath":"/opt/java/bin/java"'

# --- profiles
req POST /api/profiles '{"name": "Survival", "minecraftVersion": "1.21.1", "loader": "fabric", "loaderVersion": "0.16.5"}'
check "create profile -> 201"           status_and_body 201 '"name":"Survival"'
PROFILE_ID=$(json_field id)
check "profile id is 12 hex chars"      eval '[[ "$PROFILE_ID" =~ ^[0-9a-f]{12}$ ]]'
check "createdAt is ISO-8601 UTC"       eval '[[ "$(json_field createdAt)" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]'
check "game dir created"                test -d "$DATA_DIR/profiles/$PROFILE_ID"
req POST /api/profiles '{"name": "X", "minecraftVersion": "1.21.1", "loader": "bukkit"}'
check "invalid loader -> 400"           status_and_body 400 '"code":"bad_request"'
req POST /api/profiles '{"minecraftVersion": "1.21.1", "loader": "fabric"}'
check "missing name -> 400"             status_is 400
req GET /api/profiles
check "list contains profile"           status_and_body 200 "\"id\":\"$PROFILE_ID\""
req PATCH "/api/profiles/$PROFILE_ID" '{"name": "Hardcore", "memoryMb": 8192}'
check "PATCH profile"                   status_and_body 200 '"name":"Hardcore"'
check "PATCH profile memoryMb"          body_has '"memoryMb":8192'
req PATCH "/api/profiles/$PROFILE_ID" '{"id": "000000000000"}'
check "PATCH read-only field -> 400"    status_is 400
req GET "/api/profiles/$PROFILE_ID"
check "GET profile"                     status_and_body 200 '"name":"Hardcore"'
check "profiles.json written"           grep -q '"Hardcore"' "$DATA_DIR/profiles.json"
req DELETE "/api/profiles/$PROFILE_ID"
check "DELETE profile"                  status_is 200
check "game dir removed"                test ! -e "$DATA_DIR/profiles/$PROFILE_ID"
req GET "/api/profiles/$PROFILE_ID"
check "deleted profile -> 404"          status_and_body 404 '"code":"not_found"'
req DELETE "/api/profiles/$PROFILE_ID"
check "DELETE again -> 404"             status_is 404

# --- jobs
req POST /api/_test/jobs '{"steps": 4, "delayMs": 50}'
check "start job -> 202"                status_and_body 202 '"state":"running"'
JOB_ID=$(json_field id)
check "job polled to done"              poll_job "$JOB_ID" done
check "job result and progress"         eval 'body_has "\"result\":{\"steps\":4}" && body_has "\"progress\":1.0"'
req POST /api/_test/jobs '{"steps": 2, "delayMs": 20, "fail": true}'
FAIL_ID=$(json_field id)
check "failing job polled to failed"    poll_job "$FAIL_ID" failed
check "failed job carries error"        body_has '"error":"test job failed on purpose"'
req POST /api/_test/jobs '{"steps": 200, "delayMs": 50}'
CANCEL_ID=$(json_field id)
req POST "/api/jobs/$CANCEL_ID/cancel"
check "cancel accepted"                 status_is 200
check "job polled to cancelled"         poll_job "$CANCEL_ID" cancelled
req GET /api/jobs
check "job list newest first"           eval 'body_has "[{\"createdAt\"" && [ "$(json_field id)" = "$CANCEL_ID" ]'
req GET /api/jobs/000000000000
check "unknown job -> 404"              status_is 404

# --- errors
req PATCH /api/settings '{"memoryMb": '
check "invalid JSON -> 400"             status_and_body 400 '{"error":{"code":"bad_request","message":"request body is not valid JSON"}}'
req GET /api/does-not-exist
check "unknown route -> 404"            status_and_body 404 '{"error":{"code":"not_found"'
req GET /not-api "" notoken
check "non-api path -> 404"             status_and_body 404 '"code":"not_found"'
req DELETE /api/settings
check "wrong method -> 405"             status_and_body 405 '"code":"bad_request"'
req GET /api/providers/modrinth/projects/x/nothing
check "unknown endpoint under a module -> 404"  status_and_body 404 '"code":"not_found"'
req GET /api/health "" notoken
check "server still healthy"            status_is 200

echo "smoke: $((CHECKS - FAILURES)) / $CHECKS checks passed"
if [ "$FAILURES" -ne 0 ]; then
    echo "smoke: backend log:" >&2
    cat "$LOG" >&2
    exit 1
fi
