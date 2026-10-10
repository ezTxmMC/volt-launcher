#!/usr/bin/env bash
# End-to-end test of the mods module against real jars and the real Modrinth API.
#
#   tests/mods/test_mods.sh [path/to/volt-backend]     (default: dist/volt-backend)
#
# Downloads a few pinned mod jars from Modrinth once (cached in
# $VOLT_TEST_JARS, default ${TMPDIR:-/tmp}/volt-mods-jars, verified by sha1),
# starts the backend on a free port with a temporary data dir, fills a
# profile's mods/ folder (plus a .jar.disabled copy, a broken jar, a
# synthetic forge jar using ${file.jarVersion} and a non-jar file) and drives
# scan, identify, check-updates, toggle, delete, update and update-all with
# curl. Needs curl, python3 and sha1sum, and network access to Modrinth.
set -u
shopt -s nullglob

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BIN=${1:-"$BACKEND_DIR/dist/volt-backend"}
[ -x "$BIN" ] || { echo "test_mods: $BIN missing - build first" >&2; exit 1; }
for tool in curl python3 sha1sum; do
    command -v "$tool" >/dev/null 2>&1 || { echo "test_mods: $tool is required" >&2; exit 1; }
done

UA="VoltLauncher-next-tests (https://github.com/ezTxmMC/VoltLauncher)"
JARS=${VOLT_TEST_JARS:-"${TMPDIR:-/tmp}/volt-mods-jars"}
DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/volt-mods-test.XXXXXX")
TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
PID=""
CHECKS=0
FAILURES=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    if [ "${KEEP:-0}" = "1" ]; then echo "test_mods: kept $DATA_DIR"; else rm -rf "$DATA_DIR"; fi
}
trap cleanup EXIT

# --- pinned jars: name|url|sha1
PINNED="
sodium-fabric-0.8.12+mc1.21.1.jar|https://cdn.modrinth.com/data/AANobbMI/versions/KIRFiWG4/sodium-fabric-0.8.12%2Bmc1.21.1.jar|70381d969eb63c0aa09dc581ef4b9a79782c0123
fabric-api-0.116.16+1.21.1.jar|https://cdn.modrinth.com/data/P7dR8mSH/versions/fpB2VatZ/fabric-api-0.116.16%2B1.21.1.jar|07fcbd957f45592ac3ac63161b0bf4f0b724c665
modmenu-11.0.4.jar|https://cdn.modrinth.com/data/mOgUt4GM/versions/v6Xx3fbU/modmenu-11.0.4.jar|8af1b0b9ee18eab5cd5e5c97c497f0e473c49e9a
jei-1.20.1-forge-15.0.0.12.jar|https://cdn.modrinth.com/data/u6dRKJwZ/versions/aVZJ3vwP/jei-1.20.1-forge-15.0.0.12.jar|91aa3d030b71728ef4e4d37e520248fd9db7006b
jei-1.21.1-neoforge-19.8.4.110.jar|https://cdn.modrinth.com/data/u6dRKJwZ/versions/ubPZrmHu/jei-1.21.1-neoforge-19.8.4.110.jar|84a1041d37efa178f909a473fab74579a49a5f02
jei_1.12.1-4.7.8.95.jar|https://cdn.modrinth.com/data/u6dRKJwZ/versions/WgEQQvWl/jei_1.12.1-4.7.8.95.jar|64669d5ecbb360c2b72f5502ca2997793f8f69af
qfapi-7.0.2_qsl-6.0.3_fapi-0.83.0_mc-1.20.1.jar|https://cdn.modrinth.com/data/qvIfYCYJ/versions/uw5SkGdQ/qfapi-7.0.2_qsl-6.0.3_fapi-0.83.0_mc-1.20.1.jar|4d9de51f9b9746fe2d173cbfd7df34cb41ce6de6
"
mkdir -p "$JARS"
while IFS='|' read -r name url sha; do
    [ -n "$name" ] || continue
    if [ ! -f "$JARS/$name" ] || [ "$(sha1sum "$JARS/$name" | cut -d' ' -f1)" != "$sha" ]; then
        curl -sfL -A "$UA" -o "$JARS/$name" "$url" || { echo "test_mods: cannot download $url" >&2; exit 1; }
        [ "$(sha1sum "$JARS/$name" | cut -d' ' -f1)" = "$sha" ] || { echo "test_mods: sha1 of $name differs" >&2; exit 1; }
    fi
done <<< "$PINNED"

# --- helpers
free_port() { python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'; }

start_backend() {
    PORT=$(free_port)
    "$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR/data" >"$DATA_DIR/out" 2>>"$DATA_DIR/log" &
    PID=$!
    for _ in $(seq 1 100); do
        grep -q "VOLT_BACKEND_READY port=$PORT" "$DATA_DIR/out" 2>/dev/null && return 0
        kill -0 "$PID" 2>/dev/null || break
        sleep 0.05
    done
    echo "test_mods: backend did not start" >&2; cat "$DATA_DIR/log" >&2; exit 1
}
stop_backend() { kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; PID=""; }

# req METHOD PATH [BODY] -> STATUS, BODY
req() {
    local args=(-s -o "$DATA_DIR/body" -w '%{http_code}' -X "$1" -H "X-Volt-Token: $TOKEN")
    if [ -n "${3:-}" ]; then args+=(-H "Content-Type: application/json" --data-binary "$3"); fi
    STATUS=$(curl "${args[@]}" "http://127.0.0.1:$PORT/api$2")
    BODY=$(cat "$DATA_DIR/body")
}

check() {
    local name=$1; shift
    CHECKS=$((CHECKS + 1))
    if "$@"; then echo "ok    $name"; else FAILURES=$((FAILURES + 1)); echo "FAIL  $name (status $STATUS, body ${BODY:0:400})"; fi
}
status_is() { [ "$STATUS" = "$1" ]; }
# py EXPR: evaluates a Python expression with `b` = parsed BODY; succeeds when truthy
py() { printf '%s' "$BODY" | python3 -I -c "import json,sys; b=json.load(sys.stdin); sys.exit(0 if ($1) else 1)"; }
pyval() { printf '%s' "$BODY" | python3 -I -c "import json,sys; b=json.load(sys.stdin); print($1)"; }
mod() { printf "[m for m in b if m['fileName']=='%s'][0]" "$1"; }   # python snippet

# run_job METHOD PATH -> waits for the job (max ~60 s); BODY = final job
run_job() {
    req "$1" "$2"
    JOB_STATUS=$STATUS
    [ "$STATUS" = "202" ] || return 1
    local id; id=$(pyval "b['id']")
    for _ in $(seq 1 300); do
        req GET "/jobs/$id"
        case "$BODY" in *'"state":"running"'*) sleep 0.2 ;; *) return 0 ;; esac
    done
    return 1
}

start_backend
echo "test_mods: backend on port $PORT, data dir $DATA_DIR"
req POST /profiles '{"name": "Mods", "minecraftVersion": "1.21.1", "loader": "fabric", "loaderVersion": "0.16.5"}'
P=$(pyval "b['id']")
MODS="$DATA_DIR/data/profiles/$P/mods"

req GET "/profiles/$P/mods"
check "empty profile -> []"               eval 'status_is 200 && [ "$BODY" = "[]" ]'
check "mods/ created on demand"           test -d "$MODS"

while IFS='|' read -r name url sha; do [ -n "$name" ] && cp "$JARS/$name" "$MODS/"; done <<< "$PINNED"
cp "$MODS/modmenu-11.0.4.jar" "$MODS/modmenu-copy.jar.disabled"
head -c 5000 /dev/urandom > "$MODS/broken.jar"
echo "not a mod" > "$MODS/readme.txt"
mkdir -p "$MODS/subdir.jar"
python3 -I - "$MODS/jarversion-test.jar" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED)
z.writestr('META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\r\nImplementation-Version: 2.3.4\r\n')
z.writestr('META-INF/mods.toml', 'modLoader="javafml"\nloaderVersion="[47,)"\nlicense="MIT"\n[[mods]]\nmodId="jvtest"\nversion="${file.jarVersion}"\ndisplayName="Jar Version Test"\n')
z.close()
PY

# --- scan
req GET "/profiles/$P/mods"
check "scan lists 10 jars"                py "len(b) == 10"
check "non-jars and directories ignored"  py "not any(m['fileName'] in ('readme.txt', 'subdir.jar') for m in b)"
ALL_SHA_OK=1
for f in "$MODS"/*.jar "$MODS"/*.jar.disabled; do
    [ -f "$f" ] || continue
    n=$(basename "$f"); s=$(sha1sum "$f" | cut -d' ' -f1)
    py "$(mod "$n")['sha1'] == '$s' and $(mod "$n")['size'] == $(stat -c %s "$f")" || { ALL_SHA_OK=0; echo "      sha1/size differ for $n"; }
done
check "sha1 and size match sha1sum/stat"  test "$ALL_SHA_OK" = 1
check "fabric metadata (sodium)"          py "$(mod 'sodium-fabric-0.8.12+mc1.21.1.jar')['metadata'] == {'loader': 'fabric', 'modId': 'sodium', 'name': 'Sodium', 'version': '0.8.12+mc1.21.1', 'description': $(mod 'sodium-fabric-0.8.12+mc1.21.1.jar')['metadata']['description']}"
check "quilt metadata (qfapi)"            py "$(mod 'qfapi-7.0.2_qsl-6.0.3_fapi-0.83.0_mc-1.20.1.jar')['metadata']['loader'] == 'quilt' and $(mod 'qfapi-7.0.2_qsl-6.0.3_fapi-0.83.0_mc-1.20.1.jar')['metadata']['modId'] == 'quilted_fabric_api'"
check "forge mods.toml (jei 1.20.1)"      py "$(mod 'jei-1.20.1-forge-15.0.0.12.jar')['metadata']['loader'] == 'forge' and $(mod 'jei-1.20.1-forge-15.0.0.12.jar')['metadata']['version'] == '15.0.0.12' and $(mod 'jei-1.20.1-forge-15.0.0.12.jar')['metadata']['name'] == 'Just Enough Items'"
check "neoforge.mods.toml"                py "$(mod 'jei-1.21.1-neoforge-19.8.4.110.jar')['metadata']['loader'] == 'neoforge' and $(mod 'jei-1.21.1-neoforge-19.8.4.110.jar')['metadata']['modId'] == 'jei'"
check "mcmod.info (legacy forge)"         py "$(mod 'jei_1.12.1-4.7.8.95.jar')['metadata'] == {'loader': 'forge', 'modId': 'jei', 'name': 'Just Enough Items', 'version': '4.7.8.95', 'description': 'Simple recipe and item helper.'}"
check "\${file.jarVersion} -> manifest"   py "$(mod 'jarversion-test.jar')['metadata']['version'] == '2.3.4' and $(mod 'jarversion-test.jar')['metadata']['modId'] == 'jvtest'"
check "broken jar -> loader unknown"      py "$(mod 'broken.jar')['metadata']['loader'] == 'unknown' and $(mod 'broken.jar')['source'] is None"
check ".jar.disabled -> enabled false"    py "$(mod 'modmenu-copy.jar.disabled')['enabled'] == False and $(mod 'modmenu-11.0.4.jar')['enabled'] == True"
check "source/update null before identify" py "all(m['source'] is None and m['update'] is None for m in b)"

# --- identify
run_job POST "/profiles/$P/mods/identify"
check "identify job done"                 py "b['state'] == 'done' and b['kind'] == 'mods-identify'"
check "identify result counts"            py "b['result']['total'] == 10 and b['result']['identified'] == 8 and b['result']['unknown'] == 2"
check "mods.json written"                 test -f "$DATA_DIR/data/profiles/$P/.volt/mods.json"
req GET "/profiles/$P/mods"
check "sodium source from Modrinth"       py "$(mod 'sodium-fabric-0.8.12+mc1.21.1.jar')['source'] == {'provider': 'modrinth', 'projectId': 'AANobbMI', 'versionId': 'KIRFiWG4', 'versionNumber': 'mc1.21.1-0.8.12-fabric', 'name': 'Sodium'}"
check "disabled copy shares the source"   py "$(mod 'modmenu-copy.jar.disabled')['source']['projectId'] == 'mOgUt4GM'"
check "unknown jars keep source null"     py "$(mod 'broken.jar')['source'] is None and $(mod 'jarversion-test.jar')['source'] is None"

# --- check-updates
req POST "/profiles/$P/mods/check-updates"
CU_ID=$(pyval "b['id']")
req POST "/profiles/$P/mods/identify"
check "second mods job meanwhile -> 409"  eval 'status_is 409 || status_is 202'   # 202 only if the first already finished
[ "$STATUS" = "202" ] && sleep 2
for _ in $(seq 1 300); do req GET "/jobs/$CU_ID"; case "$BODY" in *'"state":"running"'*) sleep 0.2 ;; *) break ;; esac; done
check "check-updates job done"            py "b['state'] == 'done' and b['result']['checked'] == 7 and b['result']['updates'] >= 4"
req GET "/profiles/$P/mods"
check "sodium update offered"             py "(lambda u: u is not None and u['fileName'].startswith('sodium-fabric-') and u['fileName'] != 'sodium-fabric-0.8.12+mc1.21.1.jar' and len(u['sha1']) == 40 and u['url'].startswith('https://') and '1.21.1' in u['gameVersions'] and 'fabric' in u['loaders'])($(mod 'sodium-fabric-0.8.12+mc1.21.1.jar')['update'])"
check "1.20.1-only mod: no update"        py "$(mod 'qfapi-7.0.2_qsl-6.0.3_fapi-0.83.0_mc-1.20.1.jar')['update'] is None"
check "unknown mod: update null"          py "$(mod 'broken.jar')['update'] is None"
MODMENU_UPDATE=$(pyval "$(mod 'modmenu-copy.jar.disabled')['update']['fileName']")
MODMENU_SHA=$(pyval "$(mod 'modmenu-copy.jar.disabled')['update']['sha1']")

# --- validation
req POST "/profiles/$P/mods/..%2Fprofiles.json/toggle";   check "../ in name -> 400"      status_is 400
req POST "/profiles/$P/mods/a%2Fb.jar/toggle";            check "/ in name -> 400"        status_is 400
req POST "/profiles/$P/mods/a%5Cb.jar/toggle";            check "backslash -> 400"        status_is 400
req DELETE "/profiles/$P/mods/readme.txt";                check "non-jar delete -> 400"   status_is 400
req DELETE "/profiles/$P/mods/missing.jar";               check "missing delete -> 404"   status_is 404
req POST "/profiles/$P/mods/missing.jar/toggle";          check "missing toggle -> 404"   status_is 404
req POST "/profiles/$P/mods/missing.jar/update";          check "missing update -> 404"   status_is 404
req POST "/profiles/$P/mods/broken.jar/update";           check "no update known -> 409"  status_is 409
req POST "/profiles/$P/mods/broken.jar/nope";             check "unknown sub-route -> 404" status_is 404
req GET "/profiles/$P/mods/identify";                     check "wrong method -> 405"     status_is 405
req GET "/profiles/000000000000/mods";                    check "unknown profile -> 404"  status_is 404
check "nothing outside mods/ touched"     test -f "$DATA_DIR/data/profiles.json"

# --- toggle
req POST "/profiles/$P/mods/sodium-fabric-0.8.12%2Bmc1.21.1.jar/toggle"
check "toggle -> disabled ModFile"        py "b['fileName'] == 'sodium-fabric-0.8.12+mc1.21.1.jar.disabled' and b['enabled'] == False and b['source']['projectId'] == 'AANobbMI'"
check "toggle renamed on disk"            test -f "$MODS/sodium-fabric-0.8.12+mc1.21.1.jar.disabled"
req POST "/profiles/$P/mods/sodium-fabric-0.8.12%2Bmc1.21.1.jar.disabled/toggle"
check "toggle back -> enabled"            py "b['fileName'] == 'sodium-fabric-0.8.12+mc1.21.1.jar' and b['enabled'] == True and b['update'] is not None"
cp "$MODS/broken.jar" "$MODS/broken.jar.disabled"
req POST "/profiles/$P/mods/broken.jar/toggle"
check "toggle onto existing name -> 409"  status_is 409
rm -f "$MODS/broken.jar.disabled"

# --- update one (disabled copy keeps disabled)
run_job POST "/profiles/$P/mods/modmenu-copy.jar.disabled/update"
check "update job done"                   py "b['state'] == 'done' and b['result']['fileName'] == '$MODMENU_UPDATE.disabled' and b['result']['enabled'] == False"
check "new file present, verified sha1"   eval '[ "$(sha1sum "$MODS/$MODMENU_UPDATE.disabled" | cut -d" " -f1)" = "$MODMENU_SHA" ]'
check "old file moved to .volt-backup"    eval 'ls "$MODS/.volt-backup/" | grep -q "^modmenu-copy.jar.disabled\."'
check "old file gone"                     test ! -e "$MODS/modmenu-copy.jar.disabled"
req GET "/profiles/$P/mods"
check "updated mod has new source"        py "$(mod "$MODMENU_UPDATE.disabled")['source']['versionNumber'] is not None and $(mod "$MODMENU_UPDATE.disabled")['update'] is None"
check "identical enabled copy keeps update" py "$(mod 'modmenu-11.0.4.jar')['update'] is not None"

# --- sha1 mismatch is refused
python3 -I - "$DATA_DIR/data/profiles/$P/.volt/mods.json" <<'PY'
import json, sys
store = json.load(open(sys.argv[1]))
store['mods']['07fcbd957f45592ac3ac63161b0bf4f0b724c665']['update']['sha1'] = '0' * 40
json.dump(store, open(sys.argv[1], 'w'))
PY
run_job POST "/profiles/$P/mods/fabric-api-0.116.16%2B1.21.1.jar/update"
check "sha1 mismatch -> job failed"       py "b['state'] == 'failed' and 'sha1 mismatch' in b['error']"
check "old jar untouched after mismatch"  eval '[ "$(sha1sum "$MODS/fabric-api-0.116.16+1.21.1.jar" | cut -d" " -f1)" = 07fcbd957f45592ac3ac63161b0bf4f0b724c665 ]'
check "no temp file left"                 eval '! ls -a "$MODS" | grep -q volt-download'

# --- cancel
req POST "/profiles/$P/mods/check-updates"
CANCEL_ID=$(pyval "b['id']")
req POST "/jobs/$CANCEL_ID/cancel"
for _ in $(seq 1 300); do req GET "/jobs/$CANCEL_ID"; case "$BODY" in *'"state":"running"'*) sleep 0.2 ;; *) break ;; esac; done
check "cancelled job ends cancelled (or done if it finished first)" py "b['state'] in ('cancelled', 'done')"
echo "      (state: $(pyval "b['state']"))"
run_job POST "/profiles/$P/mods/check-updates"
check "profile usable after cancel"       py "b['state'] == 'done'"

# --- update-all (the check-updates above restored the real sha1: tamper again)
python3 -I - "$DATA_DIR/data/profiles/$P/.volt/mods.json" <<'PY'
import json, sys
store = json.load(open(sys.argv[1]))
store['mods']['07fcbd957f45592ac3ac63161b0bf4f0b724c665']['update']['sha1'] = '0' * 40
json.dump(store, open(sys.argv[1], 'w'))
PY
run_job POST "/profiles/$P/mods/update-all"
check "update-all job done"               py "b['state'] == 'done' and len(b['result']['updated']) >= 3"
check "update-all reports failures"       py "any(f['fileName'] == 'fabric-api-0.116.16+1.21.1.jar' and 'sha1 mismatch' in f['error'] for f in b['result']['failed'])"
req GET "/profiles/$P/mods"
check "sodium updated"                    py "not any(m['fileName'] == 'sodium-fabric-0.8.12+mc1.21.1.jar' for m in b) and any(m['fileName'].startswith('sodium-fabric-') and m['source'] and m['update'] is None for m in b)"
ALL_SHA_OK=1
for f in "$MODS"/*.jar "$MODS"/*.jar.disabled; do
    [ -f "$f" ] || continue
    n=$(basename "$f"); s=$(sha1sum "$f" | cut -d' ' -f1)
    py "$(mod "$n")['sha1'] == '$s'" || { ALL_SHA_OK=0; echo "      sha1 differs for $n"; }
done
check "sha1 still match after updates"    test "$ALL_SHA_OK" = 1

# --- delete
NEO_SHA=84a1041d37efa178f909a473fab74579a49a5f02
check "store has the neoforge jar"        grep -q "$NEO_SHA" "$DATA_DIR/data/profiles/$P/.volt/mods.json"
req DELETE "/profiles/$P/mods/jei-1.21.1-neoforge-19.8.4.110.jar"
check "delete -> {deleted}"               eval 'status_is 200 && [ "$BODY" = "{\"deleted\":\"jei-1.21.1-neoforge-19.8.4.110.jar\"}" ]'
check "file removed"                      test ! -e "$MODS/jei-1.21.1-neoforge-19.8.4.110.jar"
check "cache entry removed"               eval '! grep -q "$NEO_SHA" "$DATA_DIR/data/profiles/$P/.volt/mods.json"'
req DELETE "/profiles/$P/mods/jei-1.21.1-neoforge-19.8.4.110.jar"
check "delete again -> 404"               status_is 404

# --- persistence
req GET "/profiles/$P/mods"; BEFORE=$BODY
stop_backend
start_backend
req GET "/profiles/$P/mods"
check "sources survive a restart"         eval '[ "$BODY" = "$BEFORE" ]'

echo "test_mods: $((CHECKS - FAILURES)) / $CHECKS checks passed"
if [ "$FAILURES" -ne 0 ]; then echo "test_mods: backend log:" >&2; tail -50 "$DATA_DIR/log" >&2; exit 1; fi
