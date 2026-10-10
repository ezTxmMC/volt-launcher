#!/usr/bin/env bash
# Unit tests of src/logo: the version classification, the priority of the logo sources and
# the vanilla texture from a client jar. The fixtures (profiles.json, client jars with the two
# block textures, a cached pack icon) are written by fixtures.py into a temporary data dir.
# Compiles unit.nv against src/core, src/providers, src/mods and src/logo in a temporary tree
# and runs it. The deleted-pack case asks the real provider; without network it falls through
# just the same. Needs python3.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-logo-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/tree" "$WORK/data"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/providers" "$WORK/tree/providers"
ln -s "$SRC/mods" "$WORK/tree/mods"
ln -s "$SRC/logo" "$WORK/tree/logo"
cp "$HERE/unit.nv" "$WORK/tree/main.nv"

python3 -I "$HERE/fixtures.py" "$WORK/data" || exit 1
"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/unit" || exit 1
"$WORK/unit" "$WORK/data" "$WORK/data/expect.json"
