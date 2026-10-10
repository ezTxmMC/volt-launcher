#!/usr/bin/env bash
# Tests of the legacy migration (src/migration). Builds the backend into a temporary
# directory (or uses VOLT_BACKEND_BIN), then runs check.py: it makes fixtures from the
# real settings and instance list (read only, two files), runs the backend against them
# and checks the API, the mapping, the restart behaviour and that the legacy folder is not
# changed beyond the mod caches. Needs python3 and the novusc compiler.
#
#   tests/migration/run.sh                  fixture tests
#   tests/migration/run.sh --real-dry-run   dry run against the real legacy folder (checksums before/after)
#
# VOLT_LEGACY_SOURCE overrides the real folder (default ~/.voltlauncher).
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND_DIR=$(CDPATH= cd -- "$HERE/../.." && pwd)
NOVUSC=${NOVUSC:-novusc}
SOURCE=${VOLT_LEGACY_SOURCE:-$HOME/.voltlauncher}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-migration-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

BIN=${VOLT_BACKEND_BIN:-}
if [ -z "$BIN" ]; then
    BIN="$WORK/volt-backend"
    echo "run.sh: building $BACKEND_DIR/src/main.nv" >&2
    "$NOVUSC" build "$BACKEND_DIR/src/main.nv" -o "$BIN" >/dev/null || { echo "run.sh: build failed" >&2; exit 1; }
fi

if [ "${1:-}" = "--real-dry-run" ]; then
    python3 -I "$HERE/check.py" --real-dry-run "$BIN" "$WORK" "$SOURCE"
else
    python3 -I "$HERE/check.py" "$BIN" "$WORK" "$SOURCE"
fi
RC=$?
exit $RC
