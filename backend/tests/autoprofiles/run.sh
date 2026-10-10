#!/usr/bin/env bash
# Tests of the automatic profiles (src/autoprofiles/): builds volt-backend into a temporary
# directory, starts it with --enable-test-routes, a temporary data dir and VOLT_AUTOPROFILES_FIXTURES
# (manifest.json and loaders.json, rewritten by this script between the steps), then checks:
# the defaults and the setting validation, the first check (records, creates nothing), the
# Quilt rule for the default Fabric preset, new-version detection with the release/snapshot
# filter, the loader-missing skip, the name rule, the manual create, the failure path, the
# endpoint shapes and the timer (about 40 s). The Mojang manifest and the loader lookups come
# from the fixtures and no mods are downloaded, so no network access is needed.
# Needs python3 and curl. The data dir is always a temporary one (never ~/.voltlauncher).
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND=$(CDPATH= cd -- "$HERE/../.." && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-autoprofiles-test.XXXXXX")
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
    VOLT_AUTOPROFILES_FIXTURES="$FIX" "$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$DATA" --enable-test-routes \
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

# Versions of the fixture (the Mojang manifest, newest first).
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
jpy "defaults: autoProfilesEnabled false, fabric, release" \
    "ok = d['autoProfilesEnabled'] is False and d['autoProfileLoader'] == 'fabric' and d['autoProfileVersions'] == 'release'"
jpy "defaults: the Fabric preset (seven Modrinth ids)" \
    "ok = [m['projectId'] for m in d['autoProfileMods']] == ['AANobbMI','gvQqBUqZ','uXXizFIs','5ZwdcRci','NNAgCjsB','nmDcB62a','fQEb0iXm'] and all(m['provider'] == 'modrinth' and m['name'] for m in d['autoProfileMods'])"

req PATCH /api/settings '{"autoProfileMods": [{"provider": "curseforge", "projectId": "1", "name": "x"}]}'
result "bad mod: provider other than modrinth refused" 400
req PATCH /api/settings '{"autoProfileMods": [{"provider": "modrinth", "projectId": "a/b", "name": "x"}]}'
result "bad mod: projectId with a slash refused" 400
req PATCH /api/settings '{"autoProfileMods": [{"provider": "modrinth", "projectId": "AANobbMI"}]}'
result "bad mod: missing name refused" 400
req PATCH /api/settings '{"autoProfileMods": [{"provider": "modrinth", "projectId": "", "name": "x"}]}'
result "bad mod: empty projectId refused" 400
req PATCH /api/settings '{"autoProfileMods": [1]}'
result "bad mod: entry that is not an object refused" 400
req PATCH /api/settings '{"autoProfileMods": "sodium"}'
result "bad mods: not a list refused" 400
req PATCH /api/settings '{"autoProfileLoader": "bogus"}'
result "bad loader refused" 400
req PATCH /api/settings '{"autoProfileVersions": "all"}'
result "bad versions choice refused" 400
req PATCH /api/settings '{"autoProfilesEnabled": "yes"}'
result "bad enabled flag refused" 400
req GET /api/settings
jpy "refused patches changed nothing" "ok = len(d['autoProfileMods']) == 7 and d['autoProfilesEnabled'] is False"

# --- the overview before any check ---------------------------------------------------------
req GET /api/autoprofiles
jpy "fresh overview: shape and empty state" \
    "ok = set(d.keys()) == {'enabled','loader','versions','mods','seen','lastCheck','lastError','results'} and d['enabled'] is False and d['seen'] == 0 and d['lastCheck'] is None and d['lastError'] is None and d['results'] == [] and len(d['mods']) == 7"

# --- the first check records the versions and creates nothing ---------------------------------
req POST /api/autoprofiles/check
result "POST check answers 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "first check: done, nothing created, four versions recorded" \
    "ok = d['state'] == 'done' and d['result']['versions'] == 4 and d['result']['created'] == 0"
req GET /api/autoprofiles
jpy "first check: seen equals the manifest, no results, no error" \
    "ok = d['seen'] == 4 and d['results'] == [] and d['lastCheck'] is not None and d['lastError'] is None"
req GET /api/profiles
jpy "first check: no profile was created" "ok = d == []"

# --- Quilt: the default Fabric preset gives no mods to the other loaders ------------------------
write_manifest $V2
req PATCH /api/settings '{"autoProfileLoader": "quilt"}'
result "loader set to quilt (mods still the default)" 200
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "quilt: a new release gets a profile with no mods" "ok = d['state'] == 'done' and d['result']['created'] == 1"
req GET /api/profiles
jpy "quilt: the profile has the quilt loader and the right name" \
    "ok = [p for p in d if p['name'] == '9.5.0 Performance' and p['loader'] == 'quilt'] != []"
PROFILE_Q=$(jval "[p for p in d if p['name'] == '9.5.0 Performance'][0]['id']")
jpy "quilt: the automatic profile shares options and servers" \
    "ok = [p['synced'] for p in d if p['name'] == '9.5.0 Performance'] == [['options', 'servers']]"
CHECKS=$((CHECKS + 1))
if [ -L "$DATA/profiles/$PROFILE_Q/options.txt" ] && [ -L "$DATA/profiles/$PROFILE_Q/servers.dat" ] \
    && [ "$(readlink "$DATA/profiles/$PROFILE_Q/options.txt")" = "$DATA/synced/options.txt" ] \
    && [ "$(readlink "$DATA/profiles/$PROFILE_Q/servers.dat")" = "$DATA/synced/servers.dat" ]; then
    echo "ok    quilt: options.txt and servers.dat are links to the shared files"
else
    FAILURES=$((FAILURES + 1)); echo "FAIL  quilt: options.txt and servers.dat are links to the shared files"
fi
req GET /api/autoprofiles
jpy "quilt: the reason says the Fabric preset does not apply" \
    "ok = d['results'][0]['minecraftVersion'] == '9.5.0' and d['results'][0]['status'] == 'created' and 'Fabric preset does not apply' in d['results'][0]['reason']"
if [ -z "$(ls -A "$DATA/profiles/$PROFILE_Q/mods" 2>/dev/null)" ]; then
    CHECKS=$((CHECKS + 1)); echo "ok    quilt: no mod was downloaded"
else
    CHECKS=$((CHECKS + 1)); FAILURES=$((FAILURES + 1)); echo "FAIL  quilt: a mod folder has files"
fi

# --- Fabric, no mods: releases, snapshots filtered, loader missing, existing name -------------
req PATCH /api/settings '{"autoProfileLoader": "fabric", "autoProfileMods": []}'
result "back to fabric with no preset mods" 200
req POST /api/profiles '{"name": "9.4.0 Performance", "minecraftVersion": "9.4.0", "loader": "fabric"}'
result "a profile with the name of 9.4.0 exists already" 201
write_manifest $V3
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "check: one release created, the rest skipped or seen" \
    "ok = d['state'] == 'done' and d['result']['created'] == 1 and d['result']['skipped'] == 2 and d['result']['failed'] == 0"
req GET /api/autoprofiles
jpy "release filter: the new snapshot is seen but gets no profile" \
    "ok = d['seen'] == 9 and not any(r['minecraftVersion'] == '9.1.0-snapshot-1' for r in d['results'])"
jpy "new release 9.1.0 created" \
    "ok = any(r['minecraftVersion'] == '9.1.0' and r['status'] == 'created' and r['profileId'] for r in d['results'])"
jpy "loader missing: 9.3.0 skipped with the loader's reason" \
    "ok = any(r['minecraftVersion'] == '9.3.0' and r['status'] == 'skipped' and r['reason'] == 'no fabric loader is available for Minecraft 9.3.0' for r in d['results'])"
jpy "name rule: 9.4.0 skipped as already existing" \
    "ok = any(r['minecraftVersion'] == '9.4.0' and r['status'] == 'skipped' and 'already exists' in r['reason'] for r in d['results'])"
req GET /api/profiles
jpy "exactly one profile per name (no duplicate of 9.4.0)" \
    "ok = len([p for p in d if p['name'] == '9.4.0 Performance']) == 1 and len([p for p in d if p['name'] == '9.1.0 Performance']) == 1"

# --- snapshots: the new snapshot only ----------------------------------------------------------
req PATCH /api/settings '{"autoProfileVersions": "snapshots"}'
result "versions set to snapshots" 200
write_manifest $V4
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "snapshots: only the new snapshot is created" "ok = d['state'] == 'done' and d['result']['created'] == 1"
req GET /api/profiles
jpy "snapshots: 9.2.0-snapshot-2 has a profile, 9.1.0-snapshot-1 still has none" \
    "ok = any(p['name'] == '9.2.0-snapshot-2 Performance' for p in d) and not any(p['name'] == '9.1.0-snapshot-1 Performance' for p in d)"
req PATCH /api/settings '{"autoProfileVersions": "release"}'
result "versions back to release" 200

# --- manual create: the name rule, the conflict, the bad versions ------------------------------
req POST /api/autoprofiles/create '{"minecraftVersion": "9.0.0"}'
result "manual create answers 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "manual create: done with a created profile" "ok = d['state'] == 'done' and d['result']['status'] == 'created' and d['result']['profileId']"
req GET /api/profiles
jpy "manual create: the profile shares options and servers" \
    "ok = [p['synced'] for p in d if p['name'] == '9.0.0 Performance'] == [['options', 'servers']]"
req POST /api/autoprofiles/create '{"minecraftVersion": "9.0.0"}'
result "manual create again: 409 (the name exists)" 409
req POST /api/autoprofiles/create '{"minecraftVersion": "0.0.0"}'
result "manual create of an unknown version: 400" 400
req POST /api/autoprofiles/create '{}'
result "manual create without a version: 400" 400
req POST /api/autoprofiles/create
result "manual create without a body: 400" 400
req POST /api/autoprofiles/create '{"minecraftVersion": "9.3.0"}'
result "manual create of a version without a loader build: 202" 202
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "manual create without a loader build: skipped, not failed" \
    "ok = d['state'] == 'done' and d['result']['status'] == 'skipped' and d['result']['reason'] == 'no fabric loader is available for Minecraft 9.3.0'"

# --- failure path: an unreachable manifest sets lastError and the next check recovers ---------
mv "$FIX/manifest.json" "$FIX/manifest.json.off"
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "missing manifest: the check job fails with a message" "ok = d['state'] == 'failed' and d['error']"
req GET /api/autoprofiles
jpy "missing manifest: lastError is set" "ok = d['lastError'] is not None"
mv "$FIX/manifest.json.off" "$FIX/manifest.json"
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
req GET /api/autoprofiles
jpy "manifest back: the check works and lastError is cleared" "ok = d['lastError'] is None"

# --- endpoint shapes -----------------------------------------------------------------------------
req GET /api/autoprofiles
jpy "GET shape: the contract keys" \
    "ok = set(d.keys()) == {'enabled','loader','versions','mods','seen','lastCheck','lastError','results'} and isinstance(d['seen'], int)"
jpy "GET shape: result entries have the four keys, newest first, at most 50" \
    "ok = all(set(r.keys()) == {'minecraftVersion','status','reason','profileId'} for r in d['results']) and len(d['results']) <= 50 and d['results'][0]['minecraftVersion'] == '9.3.0'"

# --- the timer: switching the feature on records first, then creates later versions -----------
write_manifest $V5
req PATCH /api/settings '{"autoProfilesEnabled": true}'
result "feature switched on" 200
sleep 36
req GET /api/autoprofiles
jpy "timer: the first check after switching on records 9.6.0 without a profile" \
    "ok = d['enabled'] is True and d['lastCheck'] is not None and d['seen'] == 11"
req GET /api/profiles
jpy "timer: no profile for 9.6.0" "ok = not any(p['name'] == '9.6.0 Performance' for p in d)"
req GET /api/jobs
jpy "timer: its job ran as an autoprofile job" \
    "ok = any(j['kind'] == 'autoprofile' and j['title'] == 'Automatische Profile prüfen' and j['state'] == 'done' for j in d)"

write_manifest $V6
req POST /api/autoprofiles/check
JOB=$(jval "d['id']")
wait_job "$JOB"
jpy "later check: only the new 9.7.0 is created" "ok = d['state'] == 'done' and d['result']['created'] == 1"
req GET /api/profiles
jpy "later check: 9.7.0 has its profile" "ok = any(p['name'] == '9.7.0 Performance' and p['loader'] == 'fabric' for p in d)"
jpy "later check: the timer's profile shares options and servers" \
    "ok = [p['synced'] for p in d if p['name'] == '9.7.0 Performance'] == [['options', 'servers']]"

# --- a valid mod list is accepted and returned as set ----------------------------------------------
req PATCH /api/settings '{"autoProfileMods": [{"provider": "modrinth", "projectId": "AANobbMI", "name": "Sodium"}]}'
result "a valid preset list is accepted" 200
jpy "the valid preset list is returned" "ok = d['autoProfileMods'] == [{'provider': 'modrinth', 'projectId': 'AANobbMI', 'name': 'Sodium'}]"

stop_backend
echo
echo "$((CHECKS - FAILURES))/$CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
