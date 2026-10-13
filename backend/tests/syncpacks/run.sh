#!/usr/bin/env bash
# Tests of the synced packs (src/syncpacks/): builds volt-backend into a temporary directory and
# starts it with --enable-test-routes, a temporary data dir and the fixture directory of the
# autoprofiles checker (manifest.json, loaders.json) and of the pack installs (installs.json: a
# project id -> the file that "installing" it writes). Then checks:
#   - the pack store: create, rename, change entries, delete, the validation;
#   - applying a pack to a profile: the profile's own project wins, a project added later wins,
#     a deleted pack file stays deleted, sync after changing the pack, unlink with and without files;
#   - creating a pack from a profile;
#   - the new-version profiles: first check records, loader missing, name rule, packs applied;
#   - the migration of the automatic profiles of earlier versions.
# No network access is needed. Needs python3 and curl. The data dir is always a temporary one.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND=$(CDPATH= cd -- "$HERE/../.." && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-syncpacks-test.XXXXXX")
DATA="$WORK/data"
FIX="$WORK/fixtures"
BIN="$WORK/volt-backend"
TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
PID=""
PORT=""
STATUS=""
BODY=""
CHECKS=0
FAILURES=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$FIX"
echo "building volt-backend into $WORK"
"$NOVUSC" build "$BACKEND/src/main.nv" -o "$BIN" || { echo "run.sh: build failed" >&2; exit 1; }

free_port() {
    python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

start_backend() {
    PORT=$(free_port)
    VOLT_AUTOPROFILES_FIXTURES="$FIX" VOLT_SYNCPACKS_FIXTURES="$FIX" "$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA" --enable-test-routes \
        >"$WORK/out.log" 2>"$WORK/err.log" &
    PID=$!
    for _ in $(seq 1 100); do
        if grep -q "VOLT_BACKEND_READY port=$PORT" "$WORK/out.log" 2>/dev/null; then return 0; fi
        if ! kill -0 "$PID" 2>/dev/null; then break; fi
        sleep 0.05
    done
    echo "run.sh: backend did not start" >&2
    cat "$WORK/err.log" >&2
    exit 1
}

stop_backend() {
    kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; PID=""
}

# req METHOD PATH [BODY] -> sets STATUS and BODY
req() {
    local method=$1 path=$2 data=${3:-}
    local args=(-s -o "$WORK/body" -w '%{http_code}' -X "$method" -H "X-Volt-Token: $TOKEN")
    if [ -n "$data" ]; then args+=(-H "Content-Type: application/json" --data-binary "$data"); fi
    STATUS=$(curl "${args[@]}" "http://127.0.0.1:$PORT$path")
    BODY=$(cat "$WORK/body" 2>/dev/null)
}

# result NAME WANTED_STATUS: passes when the last STATUS is WANTED_STATUS
result() {
    local name=$1 want=$2
    CHECKS=$((CHECKS + 1))
    if [ "$STATUS" = "$want" ]; then
        echo "ok    $name"
    else
        FAILURES=$((FAILURES + 1))
        echo "FAIL  $name (status $STATUS, want $want, body ${BODY:0:300})"
    fi
}

# jpy NAME CODE: CODE runs in Python with d = the parsed last body and must set ok = True/False
jpy() {
    local name=$1 code=$2
    CHECKS=$((CHECKS + 1))
    if printf '%s' "$BODY" | python3 -I -c "import json, sys
d = json.load(sys.stdin)
ok = False
$code
sys.exit(0 if ok else 1)"; then
        echo "ok    $name"
    else
        FAILURES=$((FAILURES + 1))
        echo "FAIL  $name (status $STATUS, body ${BODY:0:300})"
    fi
}

# jval EXPR: prints the Python expression over d (the last body)
jval() {
    printf '%s' "$BODY" | python3 -I -c "import json, sys
d = json.load(sys.stdin)
print($1)"
}

# wait_job ID: polls the job until it is not running; BODY is the job
wait_job() {
    local id=$1 i
    for i in $(seq 1 600); do
        req GET "/api/jobs/$id"
        if printf '%s' "$BODY" | python3 -I -c 'import json, sys; sys.exit(0 if json.load(sys.stdin)["state"] == "running" else 1)'; then
            sleep 0.1
        else
            return 0
        fi
    done
    echo "FAIL  job $id still running" >&2
    FAILURES=$((FAILURES + 1))
    return 1
}

# write_manifest "id:type" ... : fixtures/manifest.json (newest first, as Mojang lists them)
write_manifest() {
    python3 -I - "$FIX/manifest.json" "$@" <<'PY'
import json, sys
out, pairs = sys.argv[1], sys.argv[2:]
versions = []
for pair in pairs:
    vid, kind = pair.rsplit(":", 1)
    versions.append({"id": vid, "type": kind, "url": "http://127.0.0.1/unused.json",
                     "time": "2026-01-01T00:00:00+00:00", "releaseTime": "2026-01-01T00:00:00+00:00",
                     "sha1": "0" * 40})
with open(out, "w") as f:
    json.dump({"latest": {"release": "9.0.0", "snapshot": "9.0.0"}, "versions": versions}, f)
PY
}

# write_loaders JSON: fixtures/loaders.json (loader -> the Minecraft versions it has a build for)
write_loaders() {
    printf '%s\n' "$1" > "$FIX/loaders.json"
}


# --- helpers of this suite -------------------------------------------------------------------
sha1_of() { python3 -I -c 'import hashlib, sys; print(hashlib.sha1(open(sys.argv[1], "rb").read()).hexdigest())' "$1"; }

# own_file DATA_DIR PROFILE FOLDER FILE PROJECT: a file of the profile's own with a recorded source
own_file() {
    local dir="$1/profiles/$2" folder=$3 file=$4 project=$5
    mkdir -p "$dir/$folder" "$dir/.volt"
    printf 'own %s' "$file" > "$dir/$folder/$file"
    python3 -I - "$dir/.volt/$folder.json" "$file" "$(sha1_of "$dir/$folder/$file")" "$project" <<'PYEOF'
import json, os, sys
store, file, sha, project = sys.argv[1:5]
data = {"mods": {}}
if os.path.exists(store):
    data = json.load(open(store))
data["mods"][sha] = {"fileName": file, "sha1": sha, "update": None,
                     "source": {"provider": "modrinth", "projectId": project, "versionId": "v1",
                                "versionNumber": "1", "name": project}}
json.dump(data, open(store, "w"))
PYEOF
}

# file_exists NAME PATH: a check that PATH is a file
file_exists() {
    CHECKS=$((CHECKS + 1))
    if [ -f "$2" ]; then echo "ok    $1"; else FAILURES=$((FAILURES + 1)); echo "FAIL  $1 ($2 is missing)"; fi
}
file_missing() {
    CHECKS=$((CHECKS + 1))
    if [ ! -e "$2" ]; then echo "ok    $1"; else FAILURES=$((FAILURES + 1)); echo "FAIL  $1 ($2 exists)"; fi
}

cat > "$FIX/installs.json" <<'JSON'
{
  "sodiumid":  {"fileName": "sodium-pack.jar", "content": "S"},
  "lithiumid": {"fileName": "lithium-pack.jar", "content": "L", "dependencies": [{"projectId": "depid", "fileName": "dep-pack.jar", "content": "D"}]},
  "rpid":      {"fileName": "rp-pack.zip", "content": "R"},
  "shid":      {"fileName": "sh-pack.zip", "content": "H"},
  "newid":     {"fileName": "new-pack.jar", "content": "N"}
}
JSON

V1="9.0.0:release 9.0.0-snapshot-1:snapshot 8.9.0:release 8.9.0-beta:old_beta"
V2="9.5.0:release $V1"
V3="9.4.0:release 9.3.0:release 9.1.0-snapshot-1:snapshot 9.1.0:release 9.5.0:release $V1"
V4="9.2.0-snapshot-2:snapshot $V3"
V5="9.6.0:release $V4"
V6="9.7.0:release $V5"
write_loaders '{"fabric": ["9.0.0", "9.0.0-snapshot-1", "8.9.0", "9.1.0", "9.1.0-snapshot-1", "9.2.0-snapshot-2", "9.4.0", "9.5.0", "9.6.0", "9.7.0"], "quilt": ["9.5.0"]}'
write_manifest $V1

start_backend
echo "backend on port $PORT, data dir $DATA"

# --- settings: defaults and validation -----------------------------------------------------
req GET /api/settings
jpy "defaults: new-version profiles off, fabric, release, no packs" \
    "ok = d['syncPackAutoEnabled'] is False and d['syncPackAutoLoader'] == 'fabric' and d['syncPackAutoVersions'] == 'release' and d['syncPackAutoPacks'] == []"
jpy "the old automatic profile keys are gone" "ok = not any(k.startswith('autoProfile') for k in d)"
req PATCH /api/settings '{"syncPackAutoPacks": ["nope"]}'
result "pack ids must be ids" 400
req PATCH /api/settings '{"syncPackAutoPacks": "abc"}'
result "pack ids must be a list" 400
req PATCH /api/settings '{"syncPackAutoLoader": "bogus"}'
result "bad loader refused" 400
req PATCH /api/settings '{"syncPackAutoVersions": "all"}'
result "bad versions choice refused" 400
req PATCH /api/settings '{"syncPackAutoEnabled": "yes"}'
result "bad enabled flag refused" 400

# --- the pack store ------------------------------------------------------------------------------
req GET /api/syncpacks
jpy "fresh: no packs, auto overview present" \
    "ok = d['packs'] == [] and set(d['auto'].keys()) == {'enabled','loader','versions','packs','seen','lastCheck','lastError','results'}"
req POST /api/syncpacks '{"name": "  "}'
result "empty name refused" 400
req POST /api/syncpacks '{}'
result "missing name refused" 400
req POST /api/syncpacks '{"name": "Bad", "entries": [{"provider": "other", "projectId": "a", "kind": "mod", "name": "x"}]}'
result "unknown provider refused" 400
req POST /api/syncpacks '{"name": "Bad", "entries": [{"provider": "modrinth", "projectId": "a/b", "kind": "mod", "name": "x"}]}'
result "project id with a slash refused" 400
req POST /api/syncpacks '{"name": "Bad", "entries": [{"provider": "modrinth", "projectId": "a", "kind": "datapack", "name": "x"}]}'
result "unknown kind refused" 400
req POST /api/syncpacks '{"name": "Bad", "entries": "sodium"}'
result "entries must be a list" 400

req POST /api/syncpacks '{"name": "Perf", "entries": [
  {"provider": "modrinth", "projectId": "sodiumid", "kind": "mod", "name": "Sodium"},
  {"provider": "modrinth", "projectId": "lithiumid", "kind": "mod", "name": "Lithium"},
  {"provider": "modrinth", "projectId": "rpid", "kind": "resourcepack", "name": "Faithful"},
  {"provider": "modrinth", "projectId": "shid", "kind": "shader", "name": "Complementary"},
  {"provider": "modrinth", "projectId": "sodiumid", "kind": "mod", "name": "Sodium again"}]}'
result "create a pack" 201
PACK=$(jval "d['id']")
jpy "created: four entries (the duplicate is dropped), no profiles" \
    "ok = len(d['entries']) == 4 and d['profiles'] == [] and d['name'] == 'Perf' and d['createdAt']"
req POST /api/syncpacks '{"name": "perf"}'
result "the name is unique, case-insensitive" 409
req GET "/api/syncpacks/$PACK"
result "GET one pack" 200
req GET /api/syncpacks/000000000000
result "unknown pack: 404" 404
req PATCH "/api/syncpacks/$PACK" '{"name": "Performance pack"}'
result "rename" 200
jpy "renamed, entries kept" "ok = d['name'] == 'Performance pack' and len(d['entries']) == 4"

# --- applying a pack to a profile -----------------------------------------------------------------
req POST /api/profiles '{"name": "P1", "minecraftVersion": "9.0.0", "loader": "fabric"}'
result "a profile" 201
P1=$(jval "d['id']")
own_file "$DATA" "$P1" mods my-sodium.jar sodiumid

req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\"}"
result "add the pack: 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "apply: done; the profile's own Sodium wins, the rest is installed" \
    "ok = d['state'] == 'done' and d['result']['overridden'] == ['Sodium'] and sorted(d['result']['installed']) == ['Complementary', 'Faithful', 'Lithium'] and d['result']['skipped'] == []"
file_exists "the profile's own Sodium stays" "$DATA/profiles/$P1/mods/my-sodium.jar"
file_missing "the pack's Sodium is not installed" "$DATA/profiles/$P1/mods/sodium-pack.jar"
file_exists "Lithium installed" "$DATA/profiles/$P1/mods/lithium-pack.jar"
file_exists "Lithium's dependency installed" "$DATA/profiles/$P1/mods/dep-pack.jar"
file_exists "the resource pack installed" "$DATA/profiles/$P1/resourcepacks/rp-pack.zip"
file_exists "the shader installed" "$DATA/profiles/$P1/shaderpacks/sh-pack.zip"

req GET "/api/profiles/$P1/syncpacks"
jpy "the profile view: files, overridden, nothing missing" \
    "ok = len(d['packs']) == 1 and d['packs'][0]['name'] == 'Performance pack' and sorted(f['fileName'] for f in d['packs'][0]['files']) == ['dep-pack.jar','lithium-pack.jar','rp-pack.zip','sh-pack.zip'] and [o['projectId'] for o in d['packs'][0]['overridden']] == ['sodiumid'] and d['packs'][0]['missing'] == [] and [f['dependency'] for f in d['packs'][0]['files'] if f['fileName'] == 'dep-pack.jar'] == [True]"
req GET "/api/syncpacks/$PACK"
jpy "the pack lists the profile" "ok = d['profiles'] == ['$P1']"

# Added later: the profile gets its own Lithium; the pack's file goes at the next reconcile.
own_file "$DATA" "$P1" mods my-lithium.jar lithiumid
req POST "/api/profiles/$P1/syncpacks/reconcile"
result "reconcile" 200
jpy "reconcile: Lithium is overridden now" \
    "ok = d['changes'] >= 1 and any(o['projectId'] == 'lithiumid' for o in d['packs'][0]['overridden']) and not any(f['projectId'] == 'lithiumid' and not f['dependency'] for f in d['packs'][0]['files'])"
file_missing "the pack's Lithium file is gone" "$DATA/profiles/$P1/mods/lithium-pack.jar"
file_exists "the profile's own Lithium stays" "$DATA/profiles/$P1/mods/my-lithium.jar"

# The user deletes a pack file: it stays deleted.
rm "$DATA/profiles/$P1/resourcepacks/rp-pack.zip"
req POST "/api/profiles/$P1/syncpacks/reconcile"
jpy "a deleted pack file is declined" \
    "ok = [x['projectId'] for x in d['packs'][0]['declined']] == ['rpid'] and d['packs'][0]['missing'] == []"
req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\"}"
JOB=$(jval "d['id']")
wait_job "$JOB"
file_missing "applying again does not bring the deleted file back" "$DATA/profiles/$P1/resourcepacks/rp-pack.zip"
req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\", \"retry\": true}"
JOB=$(jval "d['id']")
wait_job "$JOB"
file_exists "retry installs it again" "$DATA/profiles/$P1/resourcepacks/rp-pack.zip"

# Changing the pack and syncing: the removed entry goes, the new one comes.
req PATCH "/api/syncpacks/$PACK" '{"entries": [
  {"provider": "modrinth", "projectId": "sodiumid", "kind": "mod", "name": "Sodium"},
  {"provider": "modrinth", "projectId": "lithiumid", "kind": "mod", "name": "Lithium"},
  {"provider": "modrinth", "projectId": "rpid", "kind": "resourcepack", "name": "Faithful"},
  {"provider": "modrinth", "projectId": "newid", "kind": "mod", "name": "New"}]}'
result "change the entries" 200
req POST "/api/syncpacks/$PACK/sync"
result "sync answers 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "sync: one profile updated" \
    "ok = d['state'] == 'done' and len(d['result']['profiles']) == 1 and d['result']['profiles'][0]['removed'] == ['Complementary'] and d['result']['profiles'][0]['installed'] == ['New']"
file_missing "the removed entry's shader is gone" "$DATA/profiles/$P1/shaderpacks/sh-pack.zip"
file_exists "the new entry is installed" "$DATA/profiles/$P1/mods/new-pack.jar"

# Creating a pack from a profile.
req POST /api/syncpacks/from-profile "{\"profileId\": \"$P1\", \"name\": \"From P1\"}"
result "pack from a profile" 201
jpy "from profile: the provider-sourced projects are the entries" \
    "ok = {e['projectId'] for e in d['entries']} >= {'sodiumid', 'lithiumid', 'newid'}"
FROM=$(jval "d['id']")
req POST /api/syncpacks/from-profile '{"profileId": "000000000000", "name": "Nope"}'
result "pack from an unknown profile: 404" 404

# Unlinking: the files stay by default.
req DELETE "/api/profiles/$P1/syncpacks/$PACK?removeFiles=false"
result "unlink, keep the files" 200
file_exists "kept: the pack's New file" "$DATA/profiles/$P1/mods/new-pack.jar"
req GET "/api/profiles/$P1/syncpacks"
jpy "no packs linked any more" "ok = d['packs'] == []"
req DELETE "/api/profiles/$P1/syncpacks/$PACK"
result "unlinking twice: 404" 404
req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\"}"
JOB=$(jval "d['id']")
wait_job "$JOB"
req DELETE "/api/profiles/$P1/syncpacks/$PACK?removeFiles=true"
result "unlink with removeFiles" 200
jpy "files kept before are the profile's own now: nothing is removed" "ok = d['removed'] == []"
file_exists "the earlier pack file stays (it is the profile's own now)" "$DATA/profiles/$P1/mods/new-pack.jar"
file_exists "the profile's own file is never removed" "$DATA/profiles/$P1/mods/my-sodium.jar"

# A fresh profile: removing the files takes the pack's files and only those.
req POST /api/profiles '{"name": "P2", "minecraftVersion": "9.0.0", "loader": "fabric"}'
P2=$(jval "d['id']")
own_file "$DATA" "$P2" mods mine.jar someid
req POST "/api/profiles/$P2/syncpacks" "{\"packId\": \"$PACK\"}"
JOB=$(jval "d['id']")
wait_job "$JOB"
file_exists "P2: the pack's file is installed" "$DATA/profiles/$P2/mods/new-pack.jar"
req DELETE "/api/profiles/$P2/syncpacks/$PACK?removeFiles=true"
result "P2: unlink and remove the files" 200
jpy "P2: the pack's files were removed" "ok = 'new-pack.jar' in d['removed'] and d['kept'] == []"
file_missing "P2: the pack's file is gone" "$DATA/profiles/$P2/mods/new-pack.jar"
file_exists "P2: the profile's own file stays" "$DATA/profiles/$P2/mods/mine.jar"

# Deleting a pack unlinks it everywhere and keeps the files.
req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\"}"
JOB=$(jval "d['id']")
wait_job "$JOB"
req DELETE "/api/syncpacks/$PACK"
result "delete the pack" 200
req GET "/api/profiles/$P1/syncpacks"
jpy "the profile has no packs after the pack was deleted" "ok = d['packs'] == []"
req POST "/api/profiles/$P1/syncpacks" "{\"packId\": \"$PACK\"}"
result "adding a deleted pack: 404" 404
req DELETE "/api/syncpacks/$FROM"
result "delete the other pack" 200

# A pack on a profile without a mod loader: mods are refused with a reason, the rest installs.
req POST /api/profiles '{"name": "Plain", "minecraftVersion": "9.0.0", "loader": "vanilla"}'
PLAIN=$(jval "d['id']")
req POST /api/syncpacks '{"name": "Mixed", "entries": [{"provider": "modrinth", "projectId": "sodiumid", "kind": "mod", "name": "Sodium"}, {"provider": "modrinth", "projectId": "shid", "kind": "shader", "name": "Complementary"}]}'
MIXED=$(jval "d['id']")
req POST "/api/profiles/$PLAIN/syncpacks" "{\"packId\": \"$MIXED\"}"
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "vanilla: the shader installs, the mod is refused with a reason" \
    "ok = d['result']['installed'] == ['Complementary'] and any('no mod loader' in x for x in d['result']['skipped'])"
req GET "/api/profiles/$PLAIN/syncpacks"
jpy "vanilla: the profile view lists the failure and does not call it missing" \
    "ok = [f['projectId'] for f in d['packs'][0]['failed']] == ['sodiumid'] and d['packs'][0]['missing'] == [] and 'no mod loader' in d['packs'][0]['failed'][0]['reason']"
req DELETE "/api/syncpacks/$MIXED"
result "delete the mixed pack" 200

# Linked files that the game replaced by real files are linked again (heal).
req POST /api/profiles '{"name": "Healer", "minecraftVersion": "9.0.0", "loader": "fabric", "synced": ["servers", "options"]}'
HEAL=$(jval "d['id']")
rm "$DATA/profiles/$HEAL/servers.dat" "$DATA/profiles/$HEAL/options.txt"
printf 'NEW-SERVERS' > "$DATA/profiles/$HEAL/servers.dat"
: > "$DATA/profiles/$HEAL/options.txt"
req POST "/api/profiles/$HEAL/synced/heal"
result "heal answers 200" 200
jpy "heal: both entries were relinked" "ok = sorted((r['key'], r['status']) for r in d['report']) == [('options', 'healed'), ('servers', 'healed')]"
CHECKS=$((CHECKS + 1))
if [ -L "$DATA/profiles/$HEAL/servers.dat" ] && [ "$(cat "$DATA/synced/servers.dat")" = "NEW-SERVERS" ]; then
    echo "ok    heal: servers.dat is a link again and the shared file has the game's content"
else
    FAILURES=$((FAILURES + 1)); echo "FAIL  heal: servers.dat link or shared content"
fi
req POST "/api/profiles/$HEAL/synced/heal"
jpy "heal: nothing to do the second time" "ok = d['report'] == []"
req POST /api/profiles/000000000000/synced/heal
result "heal of an unknown profile: 404" 404

# --- new-version profiles ------------------------------------------------------------------------
req POST /api/syncpacks/auto/check
result "POST check answers 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "first check: done, nothing created, four versions recorded" \
    "ok = d['state'] == 'done' and d['result']['versions'] == 4 and d['result']['created'] == 0"
req GET /api/syncpacks/auto
jpy "first check: seen equals the manifest, no results, no error" \
    "ok = d['seen'] == 4 and d['results'] == [] and d['lastCheck'] is not None and d['lastError'] is None"

write_manifest $V2
req PATCH /api/settings '{"syncPackAutoLoader": "quilt"}'
req POST /api/syncpacks/auto/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "no pack selected: the new release gets a profile named after the version" "ok = d['state'] == 'done' and d['result']['created'] == 1"
req GET /api/profiles
jpy "that profile has the quilt loader and shares options and servers" \
    "ok = [(p['loader'], p['synced']) for p in d if p['name'] == '9.5.0'] == [('quilt', ['options', 'servers'])]"

req POST /api/syncpacks '{"name": "Speed", "entries": [{"provider": "modrinth", "projectId": "sodiumid", "kind": "mod", "name": "Sodium"}, {"provider": "modrinth", "projectId": "missingid", "kind": "mod", "name": "Gone"}]}'
SPEED=$(jval "d['id']")
req PATCH /api/settings "{\"syncPackAutoLoader\": \"fabric\", \"syncPackAutoPacks\": [\"$SPEED\", \"000000000000\"]}"
result "select the pack (an unknown id is accepted but ignored)" 200
req POST /api/profiles '{"name": "9.4.0 Speed", "minecraftVersion": "9.4.0", "loader": "fabric"}'
result "a profile with the name of 9.4.0 exists already" 201
write_manifest $V3
req POST /api/syncpacks/auto/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "check: one release created, the rest skipped or seen" \
    "ok = d['state'] == 'done' and d['result']['created'] == 1 and d['result']['skipped'] == 2 and d['result']['failed'] == 0"
req GET /api/syncpacks/auto
jpy "9.1.0 created, the new snapshot is seen without a profile, the packs are listed" \
    "ok = d['seen'] == 9 and d['packs'] == ['$SPEED'] and any(r['minecraftVersion'] == '9.1.0' and r['status'] == 'created' and r['profileId'] for r in d['results']) and not any(r['minecraftVersion'] == '9.1.0-snapshot-1' for r in d['results'])"
jpy "the result names the project that could not be installed" \
    "ok = 'Gone' in ([r['reason'] for r in d['results'] if r['minecraftVersion'] == '9.1.0'][0] or '')"
jpy "loader missing: 9.3.0 skipped with the loader's reason" \
    "ok = any(r['minecraftVersion'] == '9.3.0' and r['status'] == 'skipped' and r['reason'] == 'no fabric loader is available for Minecraft 9.3.0' for r in d['results'])"
jpy "name rule: 9.4.0 skipped as already existing" \
    "ok = any(r['minecraftVersion'] == '9.4.0' and r['status'] == 'skipped' and 'already exists' in r['reason'] for r in d['results'])"
req GET /api/profiles
jpy "the new profile is named version + pack" "ok = any(p['name'] == '9.1.0 Speed' for p in d)"
P91=$(jval "[p for p in d if p['name'] == '9.1.0 Speed'][0]['id']")
file_exists "the pack's mod was installed into it" "$DATA/profiles/$P91/mods/sodium-pack.jar"
req GET "/api/profiles/$P91/syncpacks"
jpy "and the profile is linked to the pack" \
    "ok = len(d['packs']) == 1 and d['packs'][0]['packId'] == '$SPEED' and len(d['packs'][0]['files']) == 1"
req GET "/api/syncpacks/$SPEED"
jpy "the pack lists the new profile" "ok = '$P91' in d['profiles']"

req POST /api/syncpacks/auto/create '{"minecraftVersion": "9.0.0"}'
result "manual create answers 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "manual create: done with a created profile" \
    "ok = d['state'] == 'done' and d['result']['status'] == 'created' and d['result']['profileId']"
req POST /api/syncpacks/auto/create '{"minecraftVersion": "9.0.0"}'
result "manual create again: 409 (the name exists)" 409
req POST /api/syncpacks/auto/create '{"minecraftVersion": "0.0.0"}'
result "manual create of an unknown version: 400" 400
req POST /api/syncpacks/auto/create '{}'
result "manual create without a version: 400" 400
req POST /api/syncpacks/auto/create '{"minecraftVersion": "9.3.0"}'
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "manual create without a loader build: skipped, not failed" \
    "ok = d['state'] == 'done' and d['result']['status'] == 'skipped'"

mv "$FIX/manifest.json" "$FIX/manifest.json.off"
req POST /api/syncpacks/auto/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "missing manifest: the check job fails with a message" "ok = d['state'] == 'failed' and d['error']"
req GET /api/syncpacks/auto
jpy "missing manifest: lastError is set" "ok = d['lastError'] is not None"
mv "$FIX/manifest.json.off" "$FIX/manifest.json"
req POST /api/syncpacks/auto/check
JOB=$(jval "d['id']")
wait_job "$JOB"
req GET /api/syncpacks/auto
jpy "manifest back: lastError is cleared" "ok = d['lastError'] is None"

# Deleting a selected pack takes it out of the selection.
req DELETE "/api/syncpacks/$SPEED"
result "delete the selected pack" 200
req GET /api/settings
jpy "the selection no longer names it" "ok = d['syncPackAutoPacks'] == []"

# The timer: switching the feature on records first, then creates later versions.
write_manifest $V5
req PATCH /api/settings '{"syncPackAutoEnabled": true}'
result "feature switched on" 200
sleep 36
req GET /api/syncpacks/auto
jpy "timer: the first check after switching on only records" \
    "ok = d['enabled'] is True and d['lastCheck'] is not None and d['seen'] == 11"
req GET /api/jobs
jpy "timer: its job ran as an autoprofile job" \
    "ok = any(j['kind'] == 'autoprofile' and j['title'] == 'Neue Versionen prüfen' and j['state'] == 'done' for j in d)"
write_manifest $V6
req POST /api/syncpacks/auto/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "later check: only the new 9.7.0 is created" "ok = d['state'] == 'done' and d['result']['created'] == 1"

stop_backend

# --- migration of the automatic profiles of earlier versions -----------------------------------------
DATA="$WORK/data-migration"
start_backend
req POST /api/profiles '{"name": "9.1.0 Performance", "minecraftVersion": "9.1.0", "loader": "fabric"}'
OLD=$(jval "d['id']")
req POST /api/profiles '{"name": "Mine", "minecraftVersion": "9.0.0", "loader": "fabric"}'
MINE=$(jval "d['id']")
stop_backend
own_file "$DATA" "$OLD" mods sodium-old.jar AANobbMI
python3 -I - "$DATA" "$OLD" <<'PYEOF'
import json, os, sys
data, old = sys.argv[1:3]
settings_file = os.path.join(data, "settings.json")
settings = json.load(open(settings_file)) if os.path.exists(settings_file) else {}
settings.update({
    "autoProfilesEnabled": True, "autoProfileLoader": "fabric", "autoProfileVersions": "snapshots",
    "autoProfileMods": [{"provider": "modrinth", "projectId": "AANobbMI", "name": "Sodium"},
                        {"provider": "modrinth", "projectId": "gvQqBUqZ", "name": "Lithium"}]})
json.dump(settings, open(os.path.join(data, "settings.json"), "w"))
state = {"baselined": True, "seen": ["9.0.0", "9.1.0"], "lastCheck": "2026-01-01T00:00:00Z", "lastError": None,
         "results": [{"minecraftVersion": "9.1.0", "status": "created", "reason": None, "profileId": old}]}
json.dump(state, open(os.path.join(data, "autoprofiles.json"), "w"))
os.remove(os.path.join(data, "syncpacks.json"))
PYEOF
start_backend
req GET /api/syncpacks
jpy "migration: the preset became the pack Performance with two mod entries" \
    "ok = len(d['packs']) == 1 and d['packs'][0]['name'] == 'Performance' and [e['projectId'] for e in d['packs'][0]['entries']] == ['AANobbMI', 'gvQqBUqZ'] and all(e['kind'] == 'mod' for e in d['packs'][0]['entries'])"
jpy "migration: the switches moved and the pack is selected" \
    "ok = d['auto']['enabled'] is True and d['auto']['versions'] == 'snapshots' and d['auto']['loader'] == 'fabric' and d['auto']['packs'] == [d['packs'][0]['id']] and d['auto']['seen'] == 2"
jpy "migration: the old automatic profile is linked to the pack" "ok = d['packs'][0]['profiles'] == ['$OLD']"
req GET "/api/profiles/$OLD/syncpacks"
jpy "migration: the preset mod the profile has is recorded, the other is missing" \
    "ok = [f['fileName'] for f in d['packs'][0]['files']] == ['sodium-old.jar'] and [m['projectId'] for m in d['packs'][0]['missing']] == ['gvQqBUqZ']"
file_exists "migration: no file of the profile was touched" "$DATA/profiles/$OLD/mods/sodium-old.jar"
req GET "/api/profiles/$MINE/syncpacks"
jpy "migration: other profiles are not linked" "ok = d['packs'] == []"
req GET /api/settings
jpy "migration: the old keys are gone from the settings" "ok = not any(k.startswith('autoProfile') for k in d)"
stop_backend
start_backend
req GET /api/syncpacks
jpy "migration runs once: a second start changes nothing" "ok = len(d['packs']) == 1"

stop_backend
echo
echo "$((CHECKS - FAILURES))/$CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
