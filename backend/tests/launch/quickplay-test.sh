#!/usr/bin/env bash
# Quick play checks of the launch module (no network needed):
#
#   tests/launch/quickplay-test.sh <volt-backend binary>
#
# 1. Unit: writes the metadata fixtures of Minecraft 1.21.1 (quick play rules) and 1.16.5 (no
#    quick play) into a temporary directory, compiles quickplay-unit.nv against src/core,
#    src/accounts and src/launch in a temporary tree and runs it: the launch body validation,
#    the version rules, the game arguments and the 422 for singleplayer on 1.16.5.
# 2. HTTP: starts the binary on a temporary data dir and checks POST /api/profiles/:id/launch
#    with a quickPlay body: 400 for every invalid body, 404 for a missing world, 422 for
#    singleplayer on 1.16.5, 202 for valid bodies (the jobs then run into the install step, which
#    needs the network or fails; they are cancelled at the end and no game is started).
#
# Needs novusc (NOVUSC overrides it), python3 and curl. Exits non-zero on failure.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
BIN=${1:?usage: quickplay-test.sh <volt-backend binary>}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-quickplay-test.XXXXXX")
PID=""
FAILURES=0
CHECKS=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    rm -rf "$WORK"
}
trap cleanup EXIT

# --- 1. unit ---------------------------------------------------------------------------------
mkdir -p "$WORK/tree" "$WORK/fixtures" "$WORK/unit-data"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/accounts" "$WORK/tree/accounts"
ln -s "$SRC/launch" "$WORK/tree/launch"
cp "$HERE/quickplay-unit.nv" "$WORK/tree/main.nv"

cat > "$WORK/fixtures/1.21.1.json" <<'EOF'
{
  "id": "1.21.1",
  "type": "release",
  "mainClass": "net.minecraft.client.main.Main",
  "arguments": {
    "jvm": ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
    "game": [
      "--username", "${auth_player_name}",
      "--version", "${version_name}",
      "--gameDir", "${game_directory}",
      "--assetsDir", "${assets_root}",
      "--assetIndex", "${assets_index_name}",
      "--uuid", "${auth_uuid}",
      "--accessToken", "${auth_access_token}",
      "--clientId", "${clientid}",
      "--xuid", "${auth_xuid}",
      "--userType", "${user_type}",
      "--versionType", "${version_type}",
      {"rules": [{"action": "allow", "features": {"is_demo_user": true}}], "value": "--demo"},
      {"rules": [{"action": "allow", "features": {"has_custom_resolution": true}}], "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]},
      {"rules": [{"action": "allow", "features": {"has_quick_plays_support": true}}], "value": ["--quickPlayPath", "${quickPlayPath}"]},
      {"rules": [{"action": "allow", "features": {"is_quick_play_singleplayer": true}}], "value": ["--quickPlaySingleplayer", "${quickPlaySingleplayer}"]},
      {"rules": [{"action": "allow", "features": {"is_quick_play_multiplayer": true}}], "value": ["--quickPlayMultiplayer", "${quickPlayMultiplayer}"]},
      {"rules": [{"action": "allow", "features": {"is_quick_play_realms": true}}], "value": ["--quickPlayRealms", "${quickPlayRealms}"]}
    ]
  }
}
EOF

cat > "$WORK/fixtures/1.16.5.json" <<'EOF'
{
  "id": "1.16.5",
  "type": "release",
  "mainClass": "net.minecraft.client.main.Main",
  "arguments": {
    "jvm": ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"],
    "game": [
      "--username", "${auth_player_name}",
      "--version", "${version_name}",
      "--gameDir", "${game_directory}",
      "--assetsDir", "${assets_root}",
      "--assetIndex", "${assets_index_name}",
      "--uuid", "${auth_uuid}",
      "--accessToken", "${auth_access_token}",
      "--clientId", "${clientid}",
      "--xuid", "${auth_xuid}",
      "--userType", "${user_type}",
      "--versionType", "${version_type}",
      {"rules": [{"action": "allow", "features": {"has_custom_resolution": true}}], "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]}
    ]
  }
}
EOF

"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/quickplay-unit" || { echo "FAIL  unit tests do not build"; exit 1; }
if "$WORK/quickplay-unit" "$WORK/fixtures" "$WORK/unit-data"; then
    echo "ok    unit checks"
else
    echo "FAIL  unit checks (see above)"
    FAILURES=$((FAILURES + 1))
fi

# --- 2. HTTP ---------------------------------------------------------------------------------
DATA_DIR="$WORK/data"
mkdir -p "$DATA_DIR"
TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
"$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR" >"$WORK/backend.out" 2>"$WORK/backend.log" &
PID=$!
for _ in $(seq 1 100); do grep -q VOLT_BACKEND_READY "$WORK/backend.out" 2>/dev/null && break; sleep 0.05; done

# req METHOD PATH [BODY] -> sets STATUS and BODY
req() {
    local method=$1 path=$2 data=${3:-}
    local args=(-s -o "$WORK/body" -w '%{http_code}' -X "$method" -H "X-Volt-Token: $TOKEN")
    if [ -n "$data" ]; then args+=(-H 'Content-Type: application/json' --data-binary "$data"); fi
    STATUS=$(curl "${args[@]}" "http://127.0.0.1:$PORT$path")
    BODY=$(cat "$WORK/body" 2>/dev/null)
}

# check NAME STATUS [BODY-SUBSTRING]
check() {
    local name=$1 want_status=$2 want_body=${3:-}
    CHECKS=$((CHECKS + 1))
    if [ "$STATUS" = "$want_status" ] && { [ -z "$want_body" ] || [[ "$BODY" == *"$want_body"* ]]; }; then
        echo "ok    $name"
    else
        FAILURES=$((FAILURES + 1))
        echo "FAIL  $name (status $STATUS, body $BODY)"
    fi
}

json_field() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1"; }

# profile NAME VERSION -> the new profile id
profile() {
    req POST /api/profiles "{\"name\":\"$1\",\"minecraftVersion\":\"$2\",\"loader\":\"vanilla\"}"
    echo "$BODY" | json_field id
}

P121=$(profile "quick 1.21" 1.21.1)
P121B=$(profile "quick world" 1.21.1)
P116=$(profile "quick 1.16" 1.16.5)
P_PLAIN=$(profile "quick plain" 1.21.1)
echo "profiles $P121 (1.21.1), $P121B (1.21.1), $P116 (1.16.5), $P_PLAIN (1.21.1)"
mkdir -p "$DATA_DIR/profiles/$P121/saves/Survival" "$DATA_DIR/profiles/$P121B/saves/My World" "$DATA_DIR/profiles/$P116/saves/Survival"

LONG=$(printf 'a%.0s' $(seq 256))
BAD=(
    'quickPlay not an object|{"quickPlay":"multiplayer"}'
    'mode missing|{"quickPlay":{}}'
    'mode unknown|{"quickPlay":{"mode":"realms","server":"example.org"}}'
    'mode not text|{"quickPlay":{"mode":1,"server":"example.org"}}'
    'multiplayer without server|{"quickPlay":{"mode":"multiplayer"}}'
    'server not text|{"quickPlay":{"mode":"multiplayer","server":5}}'
    'server empty|{"quickPlay":{"mode":"multiplayer","server":""}}'
    'server with a space|{"quickPlay":{"mode":"multiplayer","server":"example.org 25565"}}'
    'server with a slash|{"quickPlay":{"mode":"multiplayer","server":"example.org/25565"}}'
    'server with bad characters|{"quickPlay":{"mode":"multiplayer","server":"exa*mple.org"}}'
    'server 256 characters|{"quickPlay":{"mode":"multiplayer","server":"'"$LONG"'"}}'
    'port 0|{"quickPlay":{"mode":"multiplayer","server":"example.org:0"}}'
    'port 65536|{"quickPlay":{"mode":"multiplayer","server":"example.org:65536"}}'
    'port not a number|{"quickPlay":{"mode":"multiplayer","server":"example.org:abc"}}'
    'port empty|{"quickPlay":{"mode":"multiplayer","server":"example.org:"}}'
    'two colons|{"quickPlay":{"mode":"multiplayer","server":"example.org:1:2"}}'
    'leading colon|{"quickPlay":{"mode":"multiplayer","server":":25565"}}'
    'IPv6 not closed|{"quickPlay":{"mode":"multiplayer","server":"[::1:25565"}}'
    'singleplayer without world|{"quickPlay":{"mode":"singleplayer"}}'
    'world empty|{"quickPlay":{"mode":"singleplayer","world":""}}'
    'world with a slash|{"quickPlay":{"mode":"singleplayer","world":"a/b"}}'
    'world with a backslash|{"quickPlay":{"mode":"singleplayer","world":"a\\b"}}'
    'world ..|{"quickPlay":{"mode":"singleplayer","world":".."}}'
    'world .|{"quickPlay":{"mode":"singleplayer","world":"."}}'
    'world not text|{"quickPlay":{"mode":"singleplayer","world":3}}'
)
for entry in "${BAD[@]}"; do
    req POST "/api/profiles/$P121/launch" "${entry#*|}"
    check "400: ${entry%%|*}" 400 '"code":"bad_request"'
done

req POST "/api/profiles/aaaaaaaaaaaa/launch" '{"quickPlay":{"mode":"multiplayer","server":"example.org"}}'
check "unknown profile with quickPlay: 404" 404 '"code":"not_found"'
req POST "/api/profiles/$P121/launch" '{"quickPlay":{"mode":"singleplayer","world":"Missing"}}'
check "404: world folder missing" 404 '"code":"not_found"'
req POST "/api/profiles/$P116/launch" '{"quickPlay":{"mode":"singleplayer","world":"Survival"}}'
check "422: singleplayer on 1.16.5" 422 '"code":"unsupported"'
check "422: the message says so" 422 "cannot open a world from the command line"
req POST "/api/profiles/$P116/launch" '{"quickPlay":{"mode":"singleplayer","world":"Missing"}}'
check "422 is answered before the 404 for a version without quick play" 422 '"code":"unsupported"'

# Valid bodies start a job (202). Without a Microsoft account (fresh data dir) the job stops at
# its sign-in check, before any download: that shows the body was accepted and the job ran.
# wait_job ID: polls until the job is no longer running; BODY holds the job.
wait_job() {
    local i
    for i in $(seq 1 120); do
        req GET "/api/jobs/$1"
        case "$BODY" in *'"state":"running"'*) sleep 0.5 ;; *) return 0 ;; esac
    done
}
SIGN_IN='"error":"Sign in with a Microsoft account before you launch."'
req POST "/api/profiles/$P121/launch" '{"quickPlay":{"mode":"multiplayer","server":"example.org:25565"}}'
check "202: multiplayer on 1.21.1" 202 '"state":"running"'
JOB_A=$(echo "$BODY" | json_field id)
req POST "/api/profiles/$P121B/launch" '{"quickPlay":{"mode":"singleplayer","world":"My World"}}'
check "202: singleplayer on 1.21.1 with an existing world" 202 '"state":"running"'
JOB_B=$(echo "$BODY" | json_field id)
req POST "/api/profiles/$P116/launch" '{"quickPlay":{"mode":"multiplayer","server":"mc.example.org:19132"}}'
check "202: multiplayer on 1.16.5 (--server/--port)" 202 '"state":"running"'
JOB_C=$(echo "$BODY" | json_field id)
req POST "/api/profiles/$P_PLAIN/launch"
check "202: launch without a body is unchanged" 202 '"state":"running"'
JOB_D=$(echo "$BODY" | json_field id)

wait_job "$JOB_A"
check "job of the 1.21.1 multiplayer body reached the sign-in check" 200 "$SIGN_IN"
check "job of the 1.21.1 multiplayer body is titled by its profile" 200 '"title":"Starte quick 1.21"'
wait_job "$JOB_B"
check "job of the singleplayer body reached the sign-in check" 200 "$SIGN_IN"
wait_job "$JOB_C"
check "job of the 1.16.5 multiplayer body reached the sign-in check" 200 "$SIGN_IN"
wait_job "$JOB_D"
check "job of the body-less launch reached the sign-in check" 200 "$SIGN_IN"

for job in "$JOB_A" "$JOB_B" "$JOB_C" "$JOB_D"; do
    req POST "/api/jobs/$job/cancel"
done
req GET /api/health
check "backend still healthy" 200 '"status":"ok"'

echo "quickplay: $((CHECKS - FAILURES)) / $CHECKS HTTP checks passed, $FAILURES failed (unit: see above)"
if [ "$FAILURES" -ne 0 ]; then
    echo "--- backend log tail" >&2
    tail -n 20 "$WORK/backend.log" >&2
    exit 1
fi
exit 0
