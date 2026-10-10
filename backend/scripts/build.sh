#!/usr/bin/env sh
# Builds the backend: src/main.nv -> dist/volt-backend.
# Works from any working directory. NOVUSC overrides the compiler binary.
set -eu

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NOVUSC=${NOVUSC:-novusc}

if ! command -v "$NOVUSC" >/dev/null 2>&1; then
    echo "build.sh: '$NOVUSC' not found on PATH (set NOVUSC=/path/to/novusc)" >&2
    exit 1
fi

mkdir -p "$BACKEND_DIR/dist"
echo "build.sh: $("$NOVUSC" version) building $BACKEND_DIR/src/main.nv" >&2
"$NOVUSC" build "$BACKEND_DIR/src/main.nv" -o "$BACKEND_DIR/dist/volt-backend"
echo "build.sh: wrote $BACKEND_DIR/dist/volt-backend" >&2
