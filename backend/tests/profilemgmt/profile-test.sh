#!/usr/bin/env bash
# Profile management checks (P1) with curl against a running backend.
#   tests/profilemgmt/profile-test.sh <path-to-volt-backend>
# Starts the binary on a free port with a temporary data dir. Needs curl and python3 for
# the free port. Checks that need the network (version lists, verify) run only with NETWORK=1.
set -u

BIN=${1:-}
if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
    echo "usage: $0 <path-to-volt-backend>" >&2
    exit 2
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/volt-profile-test.XXXXXX")
TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
BASE="http://127.0.0.1:$PORT"
PID=""
FAILURES=0
CHECKS=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    rm -rf "$TMP"
}
trap cleanup EXIT

"$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$TMP/data" >"$TMP/out" 2>"$TMP/err" &
PID=$!
for _ in $(seq 1 100); do
    if grep -q "VOLT_BACKEND_READY port=$PORT" "$TMP/out" 2>/dev/null; then break; fi
    sleep 0.05
done

# req METHOD PATH [BODY] -> STATUS and BODY
req() {
    local args=(-s -o "$TMP/body" -w '%{http_code}' -X "$1" -H "X-Volt-Token: $TOKEN")
    if [ -n "${3:-}" ]; then args+=(-H 'Content-Type: application/json' --data-binary "$3"); fi
    STATUS=$(curl "${args[@]}" "$BASE$2")
    BODY=$(cat "$TMP/body")
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
has() { case "$BODY" in *"$1"*) return 0 ;; *) return 1 ;; esac; }
json_field() { printf '%s' "$BODY" | grep -o "\"$1\":\"[^\"]*\"" | head -n 1 | sed "s/^\"$1\":\"\(.*\)\"$/\1/"; }
poll_job() { # poll_job ID -> BODY holds the job once it is no longer running
    for _ in $(seq 1 200); do
        req GET "/api/jobs/$1"
        case "$BODY" in *'"state":"running"'*) sleep 0.1 ;; *) return 0 ;; esac
    done
    return 1
}

# --- create with the new fields
req POST /api/profiles '{"name":"Alpha","minecraftVersion":"1.21.1","loader":"fabric","loaderVersion":"0.16.5","group":"Modpacks","favourite":true,"envVars":{"FOO":"bar"},"wrapperCommand":"gamemoderun","fullscreen":true,"postExitCommand":"echo done"}'
check "create with new fields -> 201"       [ "$STATUS" = 201 ]
check "new fields are returned"             has '"group":"Modpacks"'
ID=$(json_field id)
check "favourite is returned"               has '"favourite":true'
req GET /api/profiles/groups
check "groups lists the group"              [ "$BODY" = '["Modpacks"]' ]

# --- validation
req PATCH "/api/profiles/$ID" '{"envVars":{"1BAD":"x"}}'
check "invalid env name -> 400"             [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$ID" '{"gameDirectory":"relative/dir"}'
check "relative game dir -> 400"            [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$ID" '{"fullscreen":"yes"}'
check "non-bool fullscreen -> 400"          [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$ID" '{"iconUrl":"data:image/svg+xml;base64,PHN2Zz4="}'
check "svg icon -> 400"                     [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$ID" '{"totalPlaytimeMs":5}'
check "playtime is read-only -> 400"        [ "$STATUS" = 400 ]

# --- custom game directory, groups, favourites
CUSTOM="$TMP/custom-game"
req PATCH "/api/profiles/$ID" "{\"gameDirectory\":\"$CUSTOM\",\"hideLauncher\":true,\"group\":\"Solo\",\"favourite\":false}"
check "custom game dir set"                 eval "[ \"\$STATUS\" = 200 ] && has \"\\\"gameDirectory\\\":\\\"$CUSTOM\\\"\""
check "gameDir follows the custom dir"      has "\"gameDir\":\"$CUSTOM\""
req PATCH "/api/profiles/$ID" '{"gameDirectory":null,"group":null}'
check "custom game dir cleared"             has '"gameDirectory":null'
check "group cleared"                       has '"group":null'
req DELETE "/api/profiles/$ID"
check "delete keeps no managed dir"         [ ! -e "$TMP/data/profiles/$ID" ]

# --- icon upload (PNG header, base64 "iVBORw0KGgo")
req POST /api/profiles '{"name":"Beta","minecraftVersion":"1.6.4","loader":"vanilla"}'
ID=$(json_field id)
req POST "/api/profiles/$ID/icon" '{"dataUrl":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}'
check "png icon accepted"                   eval '[ "$STATUS" = 200 ] && has "\"iconUrl\":\"data:image/png;base64,"'
req POST "/api/profiles/$ID/icon" '{"dataUrl":"data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'
check "png header mismatch -> 400"          [ "$STATUS" = 400 ]

# --- duplicate copies the managed directory
mkdir -p "$TMP/data/profiles/$ID/mods/sub"
echo jar > "$TMP/data/profiles/$ID/mods/sub/a.jar"
req POST "/api/profiles/$ID/duplicate" '{"name":"Beta copy"}'
check "duplicate -> 202"                    [ "$STATUS" = 202 ]
JOB=$(json_field id)
poll_job "$JOB"
check "duplicate job done"                  has '"state":"done"'
NEW=$(printf '%s' "$BODY" | grep -o '"profileId":"[0-9a-f]*"' | cut -d'"' -f4)
check "copied file is in the new profile"   test -f "$TMP/data/profiles/$NEW/mods/sub/a.jar"
req GET "/api/profiles/$NEW"
check "copy keeps the icon"                 has '"iconUrl":"data:image/png;base64,'

# --- running state and phase in the list
req GET /api/profiles
check "list has running and phase"          has '"phase":"idle"'
req GET "/api/profiles/$ID/game"
check "game status has phase"               has '"phase":"idle"'

# --- verify without network: the report is null until a check ran
req GET "/api/profiles/$ID/verify"
check "verify report null before a check"   eval '[ "$STATUS" = 200 ] && has "{\"report\":null}"'

if [ "${NETWORK:-0}" = 1 ]; then
    req GET /api/versions
    check "minecraft versions list"         eval '[ "$STATUS" = 200 ] && has "\"type\":\"release\""'
    req GET "/api/loader-versions?platformId=fabric&minecraftVersionId=1.21.1"
    check "fabric loader versions"          eval '[ "$STATUS" = 200 ] && has "\"stable\":"'
    req POST "/api/profiles/$ID/verify" '{"repair":false}'
    check "verify check -> 202"             [ "$STATUS" = 202 ]
    poll_job "$(json_field id)"
    req GET "/api/profiles/$ID/verify"
    check "verify report stored"            has '"libraries":{'
fi

echo "profilemgmt: $((CHECKS - FAILURES)) / $CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
