#!/usr/bin/env bash
# End-to-end test of the content module (mods, resource packs, shader packs,
# data packs in worlds), modpack update, export and import against the real
# Modrinth API.
#
#   tests/content/test_content.sh [path/to/volt-backend]     (default: dist/volt-backend)
#
# Starts the backend on a free port with a temporary data dir and drives the
# API with curl. Needs curl and python3, and network access to Modrinth.
# Not covered (no CurseForge bridge in this environment): CurseForge installs,
# CurseForge updates and CurseForge imports.
set -u

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BIN=${1:-"$BACKEND_DIR/dist/volt-backend"}
[ -x "$BIN" ] || { echo "test_content: $BIN missing - build first" >&2; exit 1; }
for tool in curl python3; do
    command -v "$tool" >/dev/null 2>&1 || { echo "test_content: $tool is required" >&2; exit 1; }
done

DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/volt-content-test.XXXXXX")
TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
PID=""
CHECKS=0
FAILURES=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    if [ "${KEEP:-0}" = "1" ]; then echo "test_content: kept $DATA_DIR"; else rm -rf "$DATA_DIR"; fi
}
trap cleanup EXIT

free_port() { python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'; }

PORT=$(free_port)
"$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA_DIR/data" >"$DATA_DIR/out" 2>>"$DATA_DIR/log" &
PID=$!
for _ in $(seq 1 100); do
    grep -q "VOLT_BACKEND_READY port=$PORT" "$DATA_DIR/out" 2>/dev/null && break
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.05
done
grep -q "VOLT_BACKEND_READY port=$PORT" "$DATA_DIR/out" || { echo "test_content: backend did not start" >&2; cat "$DATA_DIR/log" >&2; exit 1; }

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
# py EXPR: Python expression with `b` = parsed BODY; succeeds when truthy
py() { printf '%s' "$BODY" | python3 -I -c "import json,sys; b=json.load(sys.stdin); sys.exit(0 if ($1) else 1)"; }
pyval() { printf '%s' "$BODY" | python3 -I -c "import json,sys; b=json.load(sys.stdin); print($1)"; }
urlenc() { python3 -I -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

# job_wait ID -> sets BODY to the final job (max ~10 min)
job_wait() {
    local id=$1
    for _ in $(seq 1 3000); do
        req GET "/jobs/$id"
        case "$BODY" in *'"state":"running"'*) sleep 0.2 ;; *) return 0 ;; esac
    done
    return 1
}
# run_job METHOD PATH [BODY] -> waits for the job; STATUS is the 202 of the start
run_job() {
    req "$@"
    [ "$STATUS" = "202" ] || return 1
    local id; id=$(pyval "b['id']")
    job_wait "$id"
}

# --- profile: Fabric 1.21.1
req POST /profiles '{"name": "Content", "minecraftVersion": "1.21.1", "loader": "fabric", "loaderVersion": "0.16.5"}'
P=$(pyval "b['id']")

# --- mods: install without identify (the install records the source)
run_job POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "AANobbMI", "versionId": "KIRFiWG4", "kind": "mod", "withDependencies": false}'
check "install sodium -> job done"          py "b['state'] == 'done' and b['result']['installed'][0]['fileName'] == 'sodium-fabric-0.8.12+mc1.21.1.jar'"
req GET "/profiles/$P/content/mods"
check "mod listed with recorded source"     py "[m for m in b if m['fileName']=='sodium-fabric-0.8.12+mc1.21.1.jar'][0]['source']['projectId'] == 'AANobbMI' and [m for m in b if m['fileName']=='sodium-fabric-0.8.12+mc1.21.1.jar'][0]['metadata'] is not None"

# Iris requires Sodium: without Sodium the dependency warning appears
run_job POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "YL57xq9U", "kind": "mod", "withDependencies": false}'
check "install iris without deps -> done"   py "b['state'] == 'done' and b['result']['skipped'] == []"
req DELETE "/profiles/$P/content/mods/sodium-fabric-0.8.12%2Bmc1.21.1.jar"
check "delete sodium -> deleted"            status_is 200
req GET "/profiles/$P/content/mods/dependencies"
check "missing Sodium reported for Iris"    py "any(w['dependencyProjectId'] == 'AANobbMI' and w['state'] == 'missing' for w in b['warnings'])"
req POST "/profiles/$P/content/mods/toggle-all" '{"enabled": false}'
check "toggle-all off -> changed count"     py "b['enabled'] == False and b['changed'] >= 1 and b['skipped'] == []"
req GET "/profiles/$P/content/mods"
check "all mods disabled"                   py "all(m['enabled'] == False for m in b) and len(b) >= 1"
req POST "/profiles/$P/content/mods/toggle-all" '{"enabled": true}'
check "toggle-all on again"                 py "b['enabled'] == True"
req POST "/profiles/$P/content/mods/toggle-all" '{"enabled": "yes"}'
check "toggle-all needs a boolean -> 400"   status_is 400

# --- resource packs
run_job POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "yfDziwn1", "kind": "resourcepack"}'
check "install resource pack -> done"       py "b['state'] == 'done' and b['result']['installed'][0]['folder'] == 'resourcepacks'"
req GET "/profiles/$P/content/resourcepacks"
RP=$(pyval "b[0]['fileName']")
check "resource pack listed as .zip with source" py "b[0]['fileName'].endswith('.zip') and b[0]['source']['projectId'] == 'yfDziwn1' and b[0]['metadata'] is None"
req POST "/profiles/$P/content/resourcepacks/$(urlenc "$RP")/toggle"
check "resource pack toggle -> .disabled"   py "b['fileName'] == '$RP.disabled' and b['enabled'] == False"
req POST "/profiles/$P/content/resourcepacks/$(urlenc "$RP.disabled")/toggle"
check "toggle back -> enabled"              py "b['fileName'] == '$RP' and b['enabled'] == True"
req GET "/profiles/$P/content/resourcepacks/$(urlenc "$RP")/versions"
check "resource pack versions listed"       py "len(b) >= 1 and 'versionNumber' in b[0] and 'downloadUrl' in b[0]"
req POST "/profiles/$P/content/resourcepacks/toggle-all" '{"enabled": false}'
check "resource packs toggled off"          py "b['changed'] == 1"
req DELETE "/profiles/$P/content/resourcepacks/$(urlenc "$RP.disabled")"
check "resource pack deleted"               status_is 200
req GET "/profiles/$P/content/resourcepacks"
check "resource packs empty again"          py "b == []"
req POST "/profiles/$P/content/resourcepacks/x.txt/toggle"
check "non-pack file name -> 400"           status_is 400

# --- shader packs
run_job POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "HVnmMxH1", "kind": "shader"}'
check "install shader pack -> done"         py "b['state'] == 'done' and b['result']['installed'][0]['folder'] == 'shaderpacks'"
req GET "/profiles/$P/content/shaderpacks"
check "shader pack listed"                  py "len(b) == 1 and b[0]['source']['projectId'] == 'HVnmMxH1'"

# --- data packs live in worlds
req POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "8oi3bsk5", "kind": "datapack"}'
check "data pack without world -> 400"      status_is 400
mkdir -p "$DATA_DIR/data/profiles/$P/saves/TestWorld"
run_job POST "/profiles/$P/content/install" '{"provider": "modrinth", "projectId": "8oi3bsk5", "kind": "datapack", "world": "TestWorld"}'
check "install data pack into world -> done" py "b['state'] == 'done' and b['result']['installed'][0]['folder'] == 'saves/TestWorld/datapacks'"
check "data pack is a zip in the world"     test -f "$DATA_DIR/data/profiles/$P/saves/TestWorld/datapacks/$(printf '%s' "$BODY" | python3 -I -c 'import json,sys; print(json.load(sys.stdin)["result"]["installed"][0]["fileName"])')"
req GET "/profiles/$P/content/datapacks/worlds"
check "worlds list counts the data pack"    py "b['worlds'] == [{'folder': 'TestWorld', 'datapacks': 1}]"
req GET "/profiles/$P/content/datapacks"
check "data packs need ?world -> 400"       status_is 400
req GET "/profiles/$P/content/datapacks?world=Missing"
check "unknown world -> 404"                status_is 404
req GET "/profiles/$P/content/datapacks?world=TestWorld"
check "data pack listed per world"          py "len(b) == 1 and b[0]['source']['projectId'] == '8oi3bsk5'"
DP=$(pyval "b[0]['fileName']")
req POST "/profiles/$P/content/datapacks/$(urlenc "$DP")/toggle?world=TestWorld"
check "data pack toggle inside the world"   py "b['enabled'] == False"
req DELETE "/profiles/$P/content/datapacks/$(urlenc "$DP.disabled")?world=TestWorld"
check "data pack deleted from the world"    status_is 200

# --- identify and updates on the mods of the profile
run_job POST "/profiles/$P/content/mods/check-updates"
check "check-updates job done"              py "b['state'] == 'done' and b['kind'] == 'mods-check-updates'"

# --- modpack: an older release, update to the newest
run_job POST "/providers/packs/install" '{"provider": "modrinth", "projectId": "8yKzGJOG", "versionId": "8EJRpynP"}'
check "install older pack release -> done"  py "b['state'] == 'done'"
MP=$(pyval "b['result']['profileId']")
req GET "/profiles/$MP/modpack"
check "pack info: source and update offered" py "b['modpack']['projectId'] == '8yKzGJOG' and b['modpack']['versionId'] == '8EJRpynP' and b['updateAvailable'] == True"
req GET "/profiles/$MP/modpack/versions"
check "pack versions newest first"          py "len(b['versions']) > 2 and b['versions'][0]['datePublished'] >= b['versions'][1]['datePublished']"
check "pack record written"                 test -f "$DATA_DIR/data/profiles/$MP/.volt/pack-files.json"
run_job POST "/profiles/$MP/modpack/update" '{}'
check "update job done"                     py "b['state'] == 'done' and b['kind'] == 'pack-update' and b['result']['installed'] > 0 and len(b['result']['removed']) > 0"
req GET "/profiles/$MP/modpack"
check "pack now at the newest release"      py "b['updateAvailable'] == False and b['modpack']['versionId'] == 'ylSYr50H'"
req POST "/profiles/$MP/modpack/update" '{"versionId": "ylSYr50H"}'
check "same release again -> 409"           status_is 409

# --- export and import
req POST "/profiles/$MP/export" '{"format": "mrpack", "version": "9.9.9"}'
check "export mrpack -> 201"                status_is 201
check "export reports referenced files"     py "b['referenced'] >= 0 and b['fileName'].endswith('.mrpack')"
MRPACK=$(pyval "b['path']")
check "mrpack is a zip with an index"       python3 -I -c "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); json.loads(z.read('modrinth.index.json'))" "$MRPACK"
req POST "/profiles/$MP/export" '{"format": "curseforge"}'
check "export curseforge zip -> 201"        status_is 201
CFZIP=$(pyval "b['path']")
check "curseforge zip has a manifest"       python3 -I -c "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read('manifest.json')); assert m['manifestType']=='minecraftModpack'" "$CFZIP"
req POST "/profiles/$MP/export" '{"format": "tar"}'
check "unknown export format -> 400"        status_is 400
run_job POST "/modpacks/import" "{\"path\": \"$MRPACK\"}"
check "import mrpack -> profile created"    py "b['state'] == 'done' and b['result']['profileId']"
IP=$(pyval "b['result']['profileId']")
req GET "/profiles/$IP/modpack"
check "imported pack is not updatable"      py "b['modpack']['projectId'] == '' and 'no upstream' in b['reason']"
req POST "/profiles/$IP/modpack/update" '{}'
check "update of an import -> 400"          status_is 400
req POST "/modpacks/import" '{"path": "/nonexistent/pack.mrpack"}'
check "import of a missing file -> 404"     status_is 404
echo "test_content: profiles $P (content), $MP (pack), $IP (import)"

echo "test_content: $((CHECKS - FAILURES)) / $CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
