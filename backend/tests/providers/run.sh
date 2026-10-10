#!/usr/bin/env bash
# Unit tests of src/providers: builds fixtures, serves them locally, compiles
# unit.nv against src/core and src/providers (in a temporary tree, so the
# other feature modules are not needed) and runs it. Needs python3 and curl.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-providers-test.XXXXXX")
SERVER=""
cleanup() {
    if [ -n "$SERVER" ]; then kill "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null; fi
    rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/tree" "$WORK/fixtures"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/providers" "$WORK/tree/providers"
# providers imports mods (content store, identify); mods needs no other feature module.
ln -s "$SRC/mods" "$WORK/tree/mods"
cp "$HERE/unit.nv" "$WORK/tree/main.nv"

python3 -I "$HERE/fixtures.py" "$WORK/fixtures" > "$WORK/hashes.json" || exit 1
python3 -I "$HERE/fixtures.py" "$WORK/fixtures" serve > "$WORK/server.out" 2>&1 &
SERVER=$!
for _ in $(seq 1 50); do grep -q PORT "$WORK/server.out" 2>/dev/null && break; sleep 0.1; done
PORT=$(sed -n 's/^PORT //p' "$WORK/server.out")
[ -n "$PORT" ] || { echo "run.sh: fixture server did not start" >&2; exit 1; }

"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/unit" || exit 1
"$WORK/unit" "$WORK/fixtures" "$PORT" "$WORK/hashes.json"
