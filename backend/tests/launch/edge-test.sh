#!/usr/bin/env bash
# Edge cases of the launch module (needs network):
#   tests/launch/edge-test.sh <volt-backend binary> <data dir> [java8 path]
# - 404 / 409 / 422 answers, a failing job for a missing Minecraft version
# - early crash detection (1.21.1 started with a Java 8 binary)
# - cancelling an install job releases the profile
# - two install jobs at the same time (vanilla + fabric 1.17.1, which need
#   Java 16: exercises the Temurin download and the per-key locks)
set -u
BIN=${1:?binary}; DATA_DIR=${2:?data dir}; JAVA8=${3:-/usr/lib/jvm/java-8-openjdk/bin/java}
mkdir -p "$DATA_DIR"
TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
"$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR" >"$DATA_DIR/edge.out" 2>>"$DATA_DIR/edge.log" &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null' EXIT
for _ in $(seq 1 100); do grep -q VOLT_BACKEND_READY "$DATA_DIR/edge.out" 2>/dev/null && break; sleep 0.05; done
FAILURES=0
api() { curl -s -w ' HTTP%{http_code}' -X "$1" -H "X-Volt-Token: $TOKEN" ${3:+--data-binary "$3"} "http://127.0.0.1:$PORT$2"; }
json() { curl -s -X "$1" -H "X-Volt-Token: $TOKEN" ${3:+--data-binary "$3"} "http://127.0.0.1:$PORT$2"; }
field() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(eval("d"+sys.argv[1]))' "$1"; }
check() { local name=$1 text=$2 want=$3; case "$text" in *"$want"*) echo "ok    $name";; *) echo "FAIL  $name: $text"; FAILURES=$((FAILURES+1));; esac; }
profile() { json POST /api/profiles "$1" | field '["id"]'; }
wait_job() { local s; while true; do s=$(json GET "/api/jobs/$1"); case "$s" in *'"state":"running"'*) sleep 1;; *) echo "$s"; return;; esac; done; }

check "GET /api/java" "$(api GET /api/java)" "HTTP200"
check "POST /api/java -> 405" "$(api POST /api/java)" "HTTP405"
check "unknown profile -> 404" "$(api POST /api/profiles/aaaaaaaaaaaa/launch)" "HTTP404"
V=$(profile '{"name":"edge","minecraftVersion":"1.21.1","loader":"vanilla"}')
check "stop when not running -> 409" "$(api POST /api/profiles/$V/game/stop)" "HTTP409"
check "GET game idle" "$(api GET /api/profiles/$V/game)" '"running":false'
check "GET install-game -> 405" "$(api GET /api/profiles/$V/install-game)" "HTTP405"

BAD=$(profile '{"name":"bad","minecraftVersion":"9.9.9","loader":"vanilla"}')
J=$(json POST /api/profiles/$BAD/install-game | field '["id"]')
check "unknown Minecraft version -> failed job" "$(wait_job $J)" "does not exist"

NOJ=$(profile '{"name":"nojava","minecraftVersion":"1.21.1","loader":"vanilla","javaPath":"/nonexistent/java"}')
J=$(json POST /api/profiles/$NOJ/install-game | field '["id"]')
check "missing javaPath -> failed job" "$(wait_job $J)" "configured Java path does not exist"

# early crash: Java 8 cannot load 1.21.1's class files
CR=$(profile "{\"name\":\"crash\",\"minecraftVersion\":\"1.21.1\",\"loader\":\"vanilla\",\"javaPath\":\"$JAVA8\"}")
J=$(json POST /api/profiles/$CR/launch | field '["id"]')
check "launch with java 8 starts" "$(wait_job $J)" '"state":"done"'
sleep 4
check "early crash recorded" "$(api GET /api/profiles/$CR/game)" '"crashed":true'
echo "      $(json GET /api/profiles/$CR/game)"
tail -n 3 "$DATA_DIR/profiles/$CR/logs/launch.log" | sed 's/^/      log: /'

# cancel
CA=$(profile '{"name":"cancel","minecraftVersion":"1.16.5","loader":"vanilla"}')
J=$(json POST /api/profiles/$CA/install-game | field '["id"]')
check "second job on a busy profile -> 409" "$(api POST /api/profiles/$CA/launch)" "HTTP409"
sleep 6
json POST /api/jobs/$J/cancel >/dev/null
check "install cancelled" "$(wait_job $J)" '"state":"cancelled"'
J2=$(json POST /api/profiles/$CA/install-game | field '["id"]')
check "profile released after cancel" "$J2" ""
[ -n "$J2" ] && json POST /api/jobs/$J2/cancel >/dev/null && wait_job $J2 >/dev/null

# concurrency + Temurin 16
A=$(profile '{"name":"c-vanilla","minecraftVersion":"1.17.1","loader":"vanilla"}')
B=$(profile '{"name":"c-fabric","minecraftVersion":"1.17.1","loader":"fabric"}')
START=$(date +%s)
JA=$(json POST /api/profiles/$A/install-game | field '["id"]')
JB=$(json POST /api/profiles/$B/install-game | field '["id"]')
RA=$(wait_job $JA); RB=$(wait_job $JB)
echo "      concurrent installs took $(( $(date +%s) - START )) s"
check "concurrent vanilla 1.17.1" "$RA" '"state":"done"'
check "concurrent fabric 1.17.1" "$RB" '"state":"done"'
echo "      $RA"; echo "      $RB"
check "Temurin 16 in shared/runtimes" "$(ls "$DATA_DIR/shared/runtimes")" "jdk-16-linux-x64"
"$DATA_DIR"/shared/runtimes/jdk-16-*/bin/java -version 2>&1 | head -1 | sed 's/^/      /'
check "GET /api/java lists the runtime" "$(api GET /api/java)" "shared/runtimes/jdk-16"
ls "$DATA_DIR"/shared/runtimes/ "$DATA_DIR"/shared/versions/1.17.1 | sed 's/^/      /'
leftovers=$(find "$DATA_DIR/shared" -name '*.part-*' | wc -l)
check "no temporary .part files left" "leftovers=$leftovers" "leftovers=0"
echo "edge: $FAILURES failure(s)"
exit $FAILURES
