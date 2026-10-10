#!/usr/bin/env bash
# Synced folders: a profile's link into <dataDir>/synced/<key>, checked with curl against
# running backends. Everything happens in a temporary data dir, never in ~/.voltlauncher.
#   backend/tests/synced/run.sh [<path-to-volt-backend>]
# Without a path the backend is built with NOVUSC (default: novusc) into the temporary dir.
# Needs curl and python3 (free port). Links are checked with ln -s semantics (Linux, macOS);
# the Windows junction and hard link branches are not run here.
set -u

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/volt-synced-test.XXXXXX")
TOKEN=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
BIN=${1:-}
PID=""
FAILURES=0
CHECKS=0

cleanup() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    rm -rf "$TMP"
}
trap cleanup EXIT

if [ -z "$BIN" ]; then
    BIN="$TMP/volt-backend"
    "$NOVUSC" build "$SRC/main.nv" -o "$BIN" || exit 1
elif [ ! -x "$BIN" ]; then
    echo "usage: $0 [<path-to-volt-backend>]" >&2
    exit 2
fi

DATA="$TMP/data"
free_port() {
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# start DATA_DIR [PATH] - starts the backend; PATH (optional) replaces the environment's PATH
start() {
    local dir=$1 path=${2:-$PATH}
    PORT=$(free_port)
    BASE="http://127.0.0.1:$PORT"
    env PATH="$path" "$BIN" --port "$PORT" --token "$TOKEN" --data-dir "$dir" >"$TMP/out" 2>"$TMP/err" &
    PID=$!
    for _ in $(seq 1 100); do
        if grep -q "VOLT_BACKEND_READY port=$PORT" "$TMP/out" 2>/dev/null; then return 0; fi
        if ! kill -0 "$PID" 2>/dev/null; then break; fi
        sleep 0.05
    done
    echo "synced: backend did not start" >&2
    cat "$TMP/err" >&2
    exit 1
}
stop() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; fi
    PID=""
}

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
profile_count() { req GET /api/profiles; printf '%s' "$BODY" | grep -o '"id":"' | wc -l; }
is_link_to() { [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; }

# A profile saved before synced folders existed: no "synced" field.
mkdir -p "$DATA/profiles/0123456789ab"
mkdir -p "$DATA"
printf '%s' '[{"id":"0123456789ab","name":"Legacy","minecraftVersion":"1.20.1","loader":"vanilla"}]' > "$DATA/profiles.json"

start "$DATA"

# --- create with a shared folder
req POST /api/profiles '{"name":"Alpha","minecraftVersion":"1.21.1","loader":"fabric","loaderVersion":"0.16.5","synced":["saves"]}'
check "create with synced -> 201"                 [ "$STATUS" = 201 ]
ALPHA=$(json_field id)
check "create returns the synced array"           has '"synced":["saves"]'
check "shared folder created"                     test -d "$DATA/synced/saves"
check "link in the game folder"                   test -L "$DATA/profiles/$ALPHA/saves"
check "link points to <dataDir>/synced/saves"     is_link_to "$DATA/profiles/$ALPHA/saves" "$DATA/synced/saves"
echo "from alpha" > "$DATA/profiles/$ALPHA/saves/world.txt"
check "file through the profile appears in the shared folder" test -f "$DATA/synced/saves/world.txt"

# --- a second profile with the same key sees the same file
req POST /api/profiles '{"name":"Beta","minecraftVersion":"1.21.1","loader":"vanilla","synced":["saves"]}'
check "second profile -> 201"                     [ "$STATUS" = 201 ]
BETA=$(json_field id)
check "second profile links the same folder"      is_link_to "$DATA/profiles/$BETA/saves" "$DATA/synced/saves"
check "second profile sees the file"              [ "$(cat "$DATA/profiles/$BETA/saves/world.txt" 2>/dev/null)" = "from alpha" ]
echo "from beta" > "$DATA/profiles/$BETA/saves/beta.txt"
check "file of the second profile is shared too"  test -f "$DATA/synced/saves/beta.txt"

# --- GET and PATCH
req GET "/api/profiles/$BETA"
check "GET shows synced"                          has '"synced":["saves"]'
req PATCH "/api/profiles/$BETA" '{"synced":["mods"]}'
check "PATCH unknown key -> 400"                  [ "$STATUS" = 400 ] && has '"code":"bad_request"'
req PATCH "/api/profiles/$BETA" '{"synced":["saves","saves"]}'
check "PATCH duplicate key -> 400"                [ "$STATUS" = 400 ] && has '"code":"bad_request"'
req PATCH "/api/profiles/$BETA" '{"synced":"saves"}'
check "PATCH synced not an array -> 400"          [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$BETA" '{"synced":null}'
check "PATCH synced null -> 400"                  [ "$STATUS" = 400 ]
req PATCH "/api/profiles/$BETA" '{"synced":[],"gameDirectory":"'"$TMP"'/x"}'
check "PATCH synced with gameDirectory -> 400"    [ "$STATUS" = 400 ] && has "separate requests"
req GET "/api/profiles/$BETA"
check "rejected PATCHes changed nothing"          has '"synced":["saves"]' && is_link_to "$DATA/profiles/$BETA/saves" "$DATA/synced/saves"
req PATCH "/api/profiles/$BETA" '{"name":"Beta 2"}'
check "PATCH other fields keeps synced"           has '"synced":["saves"]'

# --- delete the first profile: only its link goes
req DELETE "/api/profiles/$ALPHA"
check "DELETE first profile -> 200"               [ "$STATUS" = 200 ]
check "shared file survives the delete"           test -f "$DATA/synced/saves/world.txt"
check "shared folder survives the delete"         test -d "$DATA/synced/saves"
check "first profile folder gone"                 test ! -e "$DATA/profiles/$ALPHA"
check "second profile still sees the file"        [ "$(cat "$DATA/profiles/$BETA/saves/world.txt" 2>/dev/null)" = "from alpha" ]
check "second profile still sees its own file"    test -f "$DATA/profiles/$BETA/saves/beta.txt"

# --- validation: nothing is created on a 400
BEFORE=$(profile_count)
req POST /api/profiles '{"name":"Bad","minecraftVersion":"1.21.1","loader":"vanilla","synced":["mods"]}'
check "unknown key -> 400"                        [ "$STATUS" = 400 ] && has '"code":"bad_request"'
req POST /api/profiles '{"name":"Bad","minecraftVersion":"1.21.1","loader":"vanilla","synced":["saves","saves"]}'
check "duplicate key -> 400"                      [ "$STATUS" = 400 ] && has '"code":"bad_request"'
req POST /api/profiles '{"name":"Bad","minecraftVersion":"1.21.1","loader":"vanilla","synced":"saves"}'
check "synced not an array -> 400"                [ "$STATUS" = 400 ]
req POST /api/profiles '{"name":"Bad","minecraftVersion":"1.21.1","loader":"vanilla","synced":[1]}'
check "synced with a non-string -> 400"           [ "$STATUS" = 400 ]
check "rejected creates add no profile"           [ "$(profile_count)" = "$BEFORE" ]

# --- an entry that already exists in a custom game directory: 409, nothing replaced
mkdir -p "$TMP/custom/saves"
echo "mine" > "$TMP/custom/saves/keep.txt"
req POST /api/profiles "{\"name\":\"Gamma\",\"minecraftVersion\":\"1.21.1\",\"loader\":\"vanilla\",\"gameDirectory\":\"$TMP/custom\",\"synced\":[\"saves\"]}"
check "existing real folder -> 409"               [ "$STATUS" = 409 ] && has '"code":"conflict"'
check "409 message names the folder"              has "the folder saves already exists in the new profile"
check "existing folder is not replaced"           [ -d "$TMP/custom/saves" ] && [ ! -L "$TMP/custom/saves" ] && [ -f "$TMP/custom/saves/keep.txt" ]
check "409 adds no profile"                       [ "$(profile_count)" = "$BEFORE" ]

# --- a custom game directory gets the link too, and delete removes only that link
mkdir -p "$TMP/custom2"
req POST /api/profiles "{\"name\":\"Delta\",\"minecraftVersion\":\"1.21.1\",\"loader\":\"vanilla\",\"gameDirectory\":\"$TMP/custom2\",\"synced\":[\"config\"]}"
check "custom game dir with synced -> 201"        [ "$STATUS" = 201 ]
DELTA=$(json_field id)
check "custom game dir gets the link"             is_link_to "$TMP/custom2/config" "$DATA/synced/config"
echo "cfg" > "$TMP/custom2/config/a.cfg"
req DELETE "/api/profiles/$DELTA"
check "delete removes the custom link"            test ! -e "$TMP/custom2/config" -a ! -L "$TMP/custom2/config"
check "shared config content survives"            test -f "$DATA/synced/config/a.cfg"

# --- legacy profile without the field reads as empty, and stays deletable
req GET /api/profiles/0123456789ab
check "legacy profile reads synced as empty"      has '"synced":[]'
req DELETE /api/profiles/0123456789ab
check "legacy profile deletes"                    [ "$STATUS" = 200 ]

# --- restart: the stored field persists
stop
start "$DATA"
req GET "/api/profiles/$BETA"
check "synced persists across a restart"          has '"synced":["saves"]'
check "link still there after a restart"          is_link_to "$DATA/profiles/$BETA/saves" "$DATA/synced/saves"
req DELETE "/api/profiles/$BETA"
check "delete after restart -> 200"               [ "$STATUS" = 200 ]
check "shared file survives after restart"        test -f "$DATA/synced/saves/world.txt"
stop

# --- PATCH "synced": enable merges the game folder into the shared one; disable copies it back
start "$DATA"
req POST /api/profiles '{"name":"Merge","minecraftVersion":"1.21.1","loader":"vanilla"}'
check "merge profile -> 201"                      [ "$STATUS" = 201 ]
MERGE=$(json_field id)
MG="$DATA/profiles/$MERGE"
mkdir -p "$MG/saves/Fresh World" "$MG/saves/Shared World" "$DATA/synced/saves/Shared World"
echo "fresh" > "$MG/saves/Fresh World/level.dat"
echo "profile copy" > "$MG/saves/Shared World/level.dat"
echo "shared copy" > "$DATA/synced/saves/Shared World/level.dat"

req PATCH "/api/profiles/$MERGE" '{"synced":["saves"]}'
check "enable saves -> 200"                       [ "$STATUS" = 200 ]
check "enable: syncReport counts (1 moved, 1 conflict)" has '"syncReport":[{"action":"enable","conflicts":1,"key":"saves","moved":1,"status":"ok"}]'
check "enable: the answer carries synced"         has '"synced":["saves"]'
check "enable: fresh world moved to the shared folder"  test -f "$DATA/synced/saves/Fresh World/level.dat"
check "enable: saves is a link to the shared folder"    is_link_to "$MG/saves" "$DATA/synced/saves"
check "enable: shared world keeps the shared copy"      [ "$(cat "$DATA/synced/saves/Shared World/level.dat")" = "shared copy" ]
check "enable: conflicting world under .volt-sync-conflicts" [ "$(cat "$MG/.volt-sync-conflicts/saves/Shared World/level.dat")" = "profile copy" ]
check "enable: the profile reads the moved world through the link" [ "$(cat "$MG/saves/Fresh World/level.dat")" = "fresh" ]
req GET "/api/profiles/$MERGE"
check "enable: GET shows synced"                  has '"synced":["saves"]'

N=$(ls -A "$DATA/synced/saves" | wc -l)
req PATCH "/api/profiles/$MERGE" '{"synced":[]}'
check "disable saves -> 200"                      [ "$STATUS" = 200 ]
check "disable: syncReport copies every shared entry" has "\"syncReport\":[{\"action\":\"disable\",\"copied\":$N,\"key\":\"saves\",\"status\":\"ok\"}]"
check "disable: synced is empty"                  has '"synced":[]'
check "disable: saves is a real folder again"     [ -d "$MG/saves" ] && [ ! -L "$MG/saves" ]
check "disable: the copy has the fresh world"     [ "$(cat "$MG/saves/Fresh World/level.dat")" = "fresh" ]
check "disable: the copy has the shared world"    [ "$(cat "$MG/saves/Shared World/level.dat")" = "shared copy" ]
check "disable: shared folder keeps its content"  [ -f "$DATA/synced/saves/Fresh World/level.dat" ] && [ -f "$DATA/synced/saves/Shared World/level.dat" ]
check "disable: conflicts folder untouched"       [ -f "$MG/.volt-sync-conflicts/saves/Shared World/level.dat" ]
stop

# A copy that fails for an entry: the shared folder untouched, the key stays enabled, the entry reported.
start "$DATA"
req POST /api/profiles '{"name":"Broken copy","minecraftVersion":"1.21.1","loader":"vanilla","synced":["screenshots"]}'
check "copy-failure profile -> 201"               [ "$STATUS" = 201 ]
BROKEN=$(json_field id)
ln -s "$TMP" "$DATA/synced/screenshots/broken-link"
req PATCH "/api/profiles/$BROKEN" '{"synced":[]}'
check "copy failure: the answer is 200"           [ "$STATUS" = 200 ]
check "copy failure: the entry is reported failed" has '"status":"failed"'
check "copy failure: the entry name is reported"  has '"failed":[{"name":"broken-link","reason":"a link is not copied"}]'
check "copy failure: the key stays enabled"       has '"synced":["screenshots"]'
check "copy failure: the link is back"            is_link_to "$DATA/profiles/$BROKEN/screenshots" "$DATA/synced/screenshots"
check "copy failure: the shared folder untouched" [ -L "$DATA/synced/screenshots/broken-link" ]

# Refusals (409): a link to another place, and a real folder where the disable needs the link.
req POST /api/profiles '{"name":"Elsewhere","minecraftVersion":"1.21.1","loader":"vanilla"}'
ELSE=$(json_field id)
mkdir -p "$TMP/elsewhere"
ln -s "$TMP/elsewhere" "$DATA/profiles/$ELSE/config"
req PATCH "/api/profiles/$ELSE" '{"synced":["config"]}'
check "a link to another place -> 409"           [ "$STATUS" = 409 ] && has '"code":"conflict"'
check "409 names the folder"                     has "the folder config is a link to another place"
check "the foreign link stays"                   is_link_to "$DATA/profiles/$ELSE/config" "$TMP/elsewhere"
req GET "/api/profiles/$ELSE"
check "409 changes nothing"                      has '"synced":[]'

req POST /api/profiles '{"name":"Real folder","minecraftVersion":"1.21.1","loader":"vanilla","synced":["config"]}'
REAL=$(json_field id)
rm "$DATA/profiles/$REAL/config"
mkdir "$DATA/profiles/$REAL/config"
req PATCH "/api/profiles/$REAL" '{"synced":[]}'
check "a real folder where the link is -> 409"   [ "$STATUS" = 409 ] && has "the folder config is not a link to the shared folder"
check "409 keeps the real folder"                [ -d "$DATA/profiles/$REAL/config" ] && [ ! -L "$DATA/profiles/$REAL/config" ]

# Bad keys: 400 for every shape, and nothing changes.
req PATCH "/api/profiles/$ELSE" '{"synced":["mods"]}'
check "PATCH unknown key -> 400 (profile without links)" [ "$STATUS" = 400 ] && has '"code":"bad_request"'
req GET "/api/profiles/$ELSE"
check "rejected PATCH leaves the profile alone"  has '"synced":[]'
stop

# A link command fails during an enable (PATH without ln): 500, and the merge is undone.
UNDO="$TMP/undo"
mkdir -p "$UNDO"
start "$UNDO" /nonexistent
req POST /api/profiles '{"name":"Undo","minecraftVersion":"1.21.1","loader":"vanilla"}'
UNDO_ID=$(json_field id)
UG="$UNDO/profiles/$UNDO_ID"
mkdir -p "$UNDO/synced/saves/Clash" "$UG/saves/Clash" "$UG/saves/Own"
echo "clash" > "$UG/saves/Clash/level.dat"
echo "own" > "$UG/saves/Own/level.dat"
req PATCH "/api/profiles/$UNDO_ID" '{"synced":["saves"]}'
check "link failure during enable -> 500"        [ "$STATUS" = 500 ] && has '"code":"internal"'
check "link failure message"                     has "cannot link the shared folder 'saves'"
check "undo: the own world is back in the game folder" [ "$(cat "$UG/saves/Own/level.dat")" = "own" ]
check "undo: the conflicting world is back too"  [ "$(cat "$UG/saves/Clash/level.dat")" = "clash" ]
check "undo: saves is a real folder, not a link" [ -d "$UG/saves" ] && [ ! -L "$UG/saves" ]
check "undo: no conflicts folder left"           [ ! -e "$UG/.volt-sync-conflicts" ]
check "undo: the shared folder got nothing"      [ ! -e "$UNDO/synced/saves/Own" ] && [ -d "$UNDO/synced/saves/Clash" ]
req GET "/api/profiles/$UNDO_ID"
check "undo: the profile still has no synced keys" has '"synced":[]'
stop

# --- a shared folder that cannot be made: 500, and the half-made profile is rolled back
ROLLBACK="$TMP/rollback"
mkdir -p "$ROLLBACK"
: > "$ROLLBACK/synced"
start "$ROLLBACK"
req POST /api/profiles '{"name":"Eps","minecraftVersion":"1.21.1","loader":"vanilla","synced":["screenshots"]}'
check "shared folder cannot be made -> 500"       [ "$STATUS" = 500 ] && has '"code":"internal"'
check "500 leaves no profile folder"              [ -z "$(ls -A "$ROLLBACK/profiles" 2>/dev/null)" ]
req GET /api/profiles
check "500 leaves no profile in the list"         [ "$BODY" = "[]" ]
stop

# --- the link command fails (ln not on PATH): 500, and the links made so far are removed
CMDFAIL="$TMP/cmdfail"
mkdir -p "$CMDFAIL"
start "$CMDFAIL" /nonexistent
req POST /api/profiles '{"name":"Zeta","minecraftVersion":"1.21.1","loader":"vanilla","synced":["saves","config"]}'
check "failed link -> 500"                        [ "$STATUS" = 500 ] && has '"code":"internal"'
check "failed link message"                       has "cannot link the shared folder 'saves'"
check "failed link leaves no profile folder"      [ -z "$(ls -A "$CMDFAIL/profiles" 2>/dev/null)" ]
req GET /api/profiles
check "failed link leaves no profile in the list" [ "$BODY" = "[]" ]
stop

# --- file entries: options (options.txt) and servers (servers.dat) ------------------------------
# The shared copy is <dataDir>/synced/options.txt, the profile gets a link to it (ln -s here).
OPT_SHARED="$DATA/synced/options.txt"
SRV_SHARED="$DATA/synced/servers.dat"
start "$DATA"
req POST /api/profiles '{"name":"Opt","minecraftVersion":"1.21.1","loader":"vanilla"}'
check "file: profile Opt -> 201"                          [ "$STATUS" = 201 ]
OPT=$(json_field id)
OG="$DATA/profiles/$OPT"
echo "fov:70" > "$OG/options.txt"
req PATCH "/api/profiles/$OPT" '{"synced":["options"]}'
check "file: enable options -> 200"                       [ "$STATUS" = 200 ]
check "file: enable options: moved 1, no conflict"        has '"syncReport":[{"action":"enable","conflicts":0,"createdEmpty":false,"key":"options","moved":1,"status":"ok"}]'
check "file: the shared file has the game's content"      [ "$(cat "$OPT_SHARED" 2>/dev/null)" = "fov:70" ]
check "file: options.txt in the game folder is a link"    is_link_to "$OG/options.txt" "$OPT_SHARED"
check "file: options.txt is a link, not a real file"      [ -L "$OG/options.txt" ]
req GET "/api/profiles/$OPT"
check "file: GET shows synced options"                    has '"synced":["options"]'

# a second profile with the same key gets the shared file, nothing moved
req POST /api/profiles '{"name":"Opt 2","minecraftVersion":"1.21.1","loader":"vanilla"}'
OPT2=$(json_field id)
req PATCH "/api/profiles/$OPT2" '{"synced":["options"]}'
check "file: second profile enables options -> 200"       [ "$STATUS" = 200 ]
check "file: second profile: moved 0, conflicts 0"        has '"syncReport":[{"action":"enable","conflicts":0,"createdEmpty":false,"key":"options","moved":0,"status":"ok"}]'
check "file: second profile links the shared file"        is_link_to "$DATA/profiles/$OPT2/options.txt" "$OPT_SHARED"
check "file: second profile reads the shared content"     [ "$(cat "$DATA/profiles/$OPT2/options.txt")" = "fov:70" ]
echo "fov:90" > "$DATA/profiles/$OPT2/options.txt"
check "file: a write through the link reaches the shared" [ "$(cat "$OPT_SHARED")" = "fov:90" ]

# disable: the profile gets a real copy back, the shared file stays
req PATCH "/api/profiles/$OPT" '{"synced":[]}'
check "file: disable options -> 200"                      [ "$STATUS" = 200 ]
check "file: disable options: copied 1"                   has '"syncReport":[{"action":"disable","copied":1,"key":"options","status":"ok"}]'
check "file: disable: options.txt is a real file again"   [ -f "$OG/options.txt" ] && [ ! -L "$OG/options.txt" ]
check "file: disable: the copy has the shared content"    [ "$(cat "$OG/options.txt")" = "fov:90" ]
check "file: disable: the shared file is intact"          [ -f "$OPT_SHARED" ] && [ "$(cat "$OPT_SHARED")" = "fov:90" ]
check "file: disable: the second profile still links"     is_link_to "$DATA/profiles/$OPT2/options.txt" "$OPT_SHARED"

# conflict: the shared servers.dat exists and the profile has its own: its copy goes aside
echo "shared servers" > "$SRV_SHARED"
req POST /api/profiles '{"name":"Srv","minecraftVersion":"1.21.1","loader":"vanilla"}'
SRV=$(json_field id)
SG="$DATA/profiles/$SRV"
echo "own servers" > "$SG/servers.dat"
req PATCH "/api/profiles/$SRV" '{"synced":["servers"]}'
check "conflict: enable servers -> 200"                   [ "$STATUS" = 200 ]
check "conflict: report conflicts 1, moved 0"             has '"syncReport":[{"action":"enable","conflicts":1,"createdEmpty":false,"key":"servers","moved":0,"status":"ok"}]'
check "conflict: the shared server list is kept"          [ "$(cat "$SRV_SHARED")" = "shared servers" ]
check "conflict: the profile's copy is in .volt-sync-conflicts" [ "$(cat "$SG/.volt-sync-conflicts/servers.dat" 2>/dev/null)" = "own servers" ]
check "conflict: servers.dat is a link to the shared file" is_link_to "$SG/servers.dat" "$SRV_SHARED"
req PATCH "/api/profiles/$SRV" '{"synced":[]}'
check "conflict: disable servers -> 200"                  [ "$STATUS" = 200 ]
check "conflict: disable gives the profile its file back" [ -f "$SG/servers.dat" ] && [ ! -L "$SG/servers.dat" ] && [ "$(cat "$SG/servers.dat")" = "shared servers" ]

# no game file and no shared file: an empty shared file is made and reported
rm -f "$SRV_SHARED"
req POST /api/profiles '{"name":"Empty","minecraftVersion":"1.21.1","loader":"vanilla"}'
EMPTY=$(json_field id)
req PATCH "/api/profiles/$EMPTY" '{"synced":["servers"]}'
check "empty: enable servers -> 200"                      [ "$STATUS" = 200 ]
check "empty: createdEmpty true"                          has '"syncReport":[{"action":"enable","conflicts":0,"createdEmpty":true,"key":"servers","moved":0,"status":"ok"}]'
check "empty: the shared file is created empty"           [ -f "$SRV_SHARED" ] && [ ! -s "$SRV_SHARED" ]
check "empty: servers.dat is a link to the shared file"   is_link_to "$DATA/profiles/$EMPTY/servers.dat" "$SRV_SHARED"

# a failed copy on disable: the shared file is a link, so it is not copied; the key stays
mv "$OPT_SHARED" "$TMP/opt-real"
ln -s "$TMP/opt-real" "$OPT_SHARED"
req PATCH "/api/profiles/$OPT2" '{"synced":[]}'
check "file copy failure: the answer is 200"              [ "$STATUS" = 200 ]
check "file copy failure: the entry is reported failed"   has '"syncReport":[{"action":"disable","copied":0,"failed":[{"name":"options.txt","reason":"a link is not copied"}],"key":"options","status":"failed"}]'
check "file copy failure: the key stays enabled"          has '"synced":["options"]'
check "file copy failure: the link is back"               is_link_to "$DATA/profiles/$OPT2/options.txt" "$OPT_SHARED"
rm "$OPT_SHARED"
mv "$TMP/opt-real" "$OPT_SHARED"
check "file copy failure: the shared content is intact"   [ "$(cat "$OPT_SHARED")" = "fov:90" ]

# create: a game file in a custom directory is refused (409); both file keys together are linked
mkdir -p "$TMP/custom3"
echo "mine" > "$TMP/custom3/options.txt"
req POST /api/profiles "{\"name\":\"Filed\",\"minecraftVersion\":\"1.21.1\",\"loader\":\"vanilla\",\"gameDirectory\":\"$TMP/custom3\",\"synced\":[\"options\"]}"
check "file: existing game file -> 409"                   [ "$STATUS" = 409 ] && has "the file options.txt already exists in the new profile"
check "file: existing game file is not replaced"          [ "$(cat "$TMP/custom3/options.txt")" = "mine" ] && [ ! -L "$TMP/custom3/options.txt" ]
req POST /api/profiles '{"name":"Both","minecraftVersion":"1.21.1","loader":"vanilla","synced":["options","servers"]}'
check "file: create with both file keys -> 201"           [ "$STATUS" = 201 ] && has '"synced":["options","servers"]'
BOTH=$(json_field id)
check "file: create links options.txt and servers.dat"    is_link_to "$DATA/profiles/$BOTH/options.txt" "$OPT_SHARED" && is_link_to "$DATA/profiles/$BOTH/servers.dat" "$SRV_SHARED"
req DELETE "/api/profiles/$BOTH"
check "file: deleting the profile keeps the shared files"  [ -f "$OPT_SHARED" ] && [ -f "$SRV_SHARED" ]
stop

# a link command fails during a file enable: the game file goes back, nothing is left behind
FUNDO="$TMP/fundo"
mkdir -p "$FUNDO"
start "$FUNDO" /nonexistent
req POST /api/profiles '{"name":"File undo","minecraftVersion":"1.21.1","loader":"vanilla"}'
FU=$(json_field id)
FG="$FUNDO/profiles/$FU"
echo "keep" > "$FG/options.txt"
req PATCH "/api/profiles/$FU" '{"synced":["options"]}'
check "file undo: link failure during enable -> 500"      [ "$STATUS" = 500 ] && has '"code":"internal"'
check "file undo: message names the file"                 has "cannot link the shared file 'options' into the game folder"
check "file undo: the game file is back as a real file"   [ -f "$FG/options.txt" ] && [ ! -L "$FG/options.txt" ] && [ "$(cat "$FG/options.txt")" = "keep" ]
check "file undo: the shared file got nothing"            [ ! -e "$FUNDO/synced/options.txt" ]
req GET "/api/profiles/$FU"
check "file undo: the profile still has no synced keys"   has '"synced":[]'
stop

echo "synced: $((CHECKS - FAILURES)) / $CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
