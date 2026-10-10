#!/usr/bin/env bash
# End-to-end test of the launch module against the real download servers.
#
#   tests/launch/launch-test.sh <volt-backend binary> <data dir> <mc version> [loader] [loaderVersion] [--no-launch]
#
# Starts the backend on a free port with the given (persistent, so downloads
# are reused) data dir, creates a profile, runs install-game and polls the job,
# checks the client jar's sha1 against Mojang's manifest, then (unless
# --no-launch) launches, checks GET /game, waits RUN_SECONDS (default 15),
# stops the game and prints the head of launch.log. Exits non-zero on failure.
set -u

BIN=${1:?binary}; DATA_DIR=${2:?data dir}; MC=${3:?minecraft version}
LOADER=${4:-vanilla}; LOADER_VERSION=${5:-}; NO_LAUNCH=${6:-}
RUN_SECONDS=${RUN_SECONDS:-15}
mkdir -p "$DATA_DIR"
TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
LOG="$DATA_DIR/backend.log"
"$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR" >"$DATA_DIR/backend.out" 2>>"$LOG" &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 1 100); do grep -q VOLT_BACKEND_READY "$DATA_DIR/backend.out" 2>/dev/null && break; sleep 0.05; done

api() { curl -s -X "$1" -H "X-Volt-Token: $TOKEN" -H 'Content-Type: application/json' ${3:+--data-binary "$3"} "http://127.0.0.1:$PORT$2"; }
field() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(eval("d"+sys.argv[1]))' "$1"; }
fail() { echo "FAIL: $*"; echo "--- backend log tail"; tail -n 20 "$LOG"; exit 1; }

poll() { # poll JOB_ID -> prints final job JSON
    local job
    while true; do
        job=$(api GET "/api/jobs/$1")
        case "$job" in *'"state":"running"'*) ;; *) echo "$job"; return ;; esac
        echo "  $(echo "$job" | field '["progress"]') $(echo "$job" | field '["message"]')" >&2
        sleep 2
    done
}

BODY="{\"name\":\"test $MC $LOADER\",\"minecraftVersion\":\"$MC\",\"loader\":\"$LOADER\"${LOADER_VERSION:+,\"loaderVersion\":\"$LOADER_VERSION\"}}"
PROFILE=$(api POST /api/profiles "$BODY")
ID=$(echo "$PROFILE" | field '["id"]') || fail "create profile: $PROFILE"
echo "profile $ID ($MC $LOADER $LOADER_VERSION)"

echo "GET /api/java: $(api GET /api/java)"

START=$(date +%s)
JOB=$(api POST "/api/profiles/$ID/install-game")
echo "install-game -> $JOB"
JOB_ID=$(echo "$JOB" | field '["id"]') || fail "install-game: $JOB"
FINAL=$(poll "$JOB_ID")
echo "install-game finished after $(( $(date +%s) - START )) s: $FINAL"
echo "$FINAL" | grep -q '"state":"done"' || fail "install-game did not finish"

# client jar sha1 against the manifest
EXPECTED=$(python3 - "$DATA_DIR/shared/versions/$MC/$MC.json" <<'EOF'
import json, sys
print(json.load(open(sys.argv[1]))["downloads"]["client"]["sha1"])
EOF
)
MANIFEST_SHA=$(curl -s https://piston-meta.mojang.com/mc/game/version_manifest_v2.json | python3 -c "
import json,sys,urllib.request
m=json.load(sys.stdin); e=[v for v in m['versions'] if v['id']=='$MC'][0]
print(json.load(urllib.request.urlopen(e['url']))['downloads']['client']['sha1'])")
ACTUAL=$(sha1sum "$DATA_DIR/shared/versions/$MC/$MC.jar" | cut -d' ' -f1)
echo "client jar sha1 $ACTUAL, cached json $EXPECTED, manifest $MANIFEST_SHA"
[ "$ACTUAL" = "$MANIFEST_SHA" ] || fail "client jar sha1 mismatch"
echo "files: $(find "$DATA_DIR/shared/libraries" -type f -name '*.jar' | wc -l) library jars, $(find "$DATA_DIR/shared/assets/objects" -type f | wc -l) asset objects, $(find "$DATA_DIR/shared/natives" -type f | wc -l) native files"

[ "$NO_LAUNCH" = "--no-launch" ] && { echo "OK (no launch)"; exit 0; }

JOB=$(api POST "/api/profiles/$ID/launch")
echo "launch -> $JOB"
JOB_ID=$(echo "$JOB" | field '["id"]') || fail "launch: $JOB"
FINAL=$(poll "$JOB_ID")
echo "launch finished: $FINAL"
echo "$FINAL" | grep -q '"state":"done"' || fail "launch did not finish"
echo "second launch while running -> $(api POST "/api/profiles/$ID/launch")"
sleep 2
echo "GET game: $(api GET "/api/profiles/$ID/game")"
echo "profile lastPlayed: $(api GET "/api/profiles/$ID" | field '["lastPlayed"]')"
sleep "$RUN_SECONDS"
STATUS=$(api GET "/api/profiles/$ID/game")
echo "GET game after ${RUN_SECONDS}s: $STATUS"
echo "stop -> $(api POST "/api/profiles/$ID/game/stop")"
sleep 6
echo "GET game after stop: $(api GET "/api/profiles/$ID/game")"
echo "--- launch.log (command line shortened)"
sed -E 's/(-cp [^ ]{0,200})[^ ]*/\1.../' "$DATA_DIR/profiles/$ID/logs/launch.log" | head -c 6000
echo
echo "--- launch.log tail"
tail -n 15 "$DATA_DIR/profiles/$ID/logs/launch.log"
case "$STATUS" in *'"running":true'*) echo "OK"; exit 0 ;; *) echo "game was not running after ${RUN_SECONDS}s"; exit 1 ;; esac
