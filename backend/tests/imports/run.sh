#!/usr/bin/env bash
# End-to-end test of the profile import (src/imports): builds the backend (or uses
# IMPORTS_BIN), builds a fixture home (fixtures.py), starts the server with
# VOLT_IMPORT_HOME pointing at it (test option, needs --enable-test-routes), runs the
# checks of check.py, then restarts it with an empty PATH (no sqlite3) and checks the
# unavailable case. Needs python3 and sqlite3 (the Modrinth and NoRisk checks).
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BACKEND=$(CDPATH= cd -- "$HERE/../.." && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-imports-test.XXXXXX")
PID=""
stop() {
    if [ -n "$PID" ]; then kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; PID=""; fi
}
cleanup() {
    stop
    rm -rf "$WORK"
}
trap cleanup EXIT

command -v python3 >/dev/null 2>&1 || { echo "run.sh: python3 is required" >&2; exit 1; }
command -v sqlite3 >/dev/null 2>&1 || { echo "run.sh: sqlite3 is required for the Modrinth and NoRisk checks" >&2; exit 1; }

if [ -n "${IMPORTS_BIN:-}" ]; then
    BIN=$IMPORTS_BIN
else
    BIN="$WORK/volt-backend"
    "$NOVUSC" build "$BACKEND/src/main.nv" -o "$BIN" || { echo "run.sh: build failed" >&2; exit 1; }
fi

HOME_DIR="$WORK/home"
DATA_DIR="$WORK/data"
mkdir -p "$WORK/outside" "$WORK/nobin"
python3 -I "$HERE/fixtures.py" "$HOME_DIR" "$WORK/outside" || exit 1

TOKEN=$(python3 -I -c 'import secrets; print(secrets.token_hex(16))')
free_port() {
    python3 -I -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# start_server LABEL [PATH]: starts the backend on a free port and waits for READY.
start_server() {
    local label=$1 path_value=${2:-$PATH}
    PORT=$(free_port)
    VOLT_IMPORT_HOME="$HOME_DIR" PATH="$path_value" "$BIN" --port "$PORT" --token "$TOKEN" \
        --data-dir "$DATA_DIR" --enable-test-routes >"$WORK/$label.out" 2>"$WORK/$label.err" &
    PID=$!
    for _ in $(seq 1 100); do
        if grep -q "VOLT_BACKEND_READY port=$PORT" "$WORK/$label.out" 2>/dev/null; then
            return 0
        fi
        if ! kill -0 "$PID" 2>/dev/null; then break; fi
        sleep 0.05
    done
    echo "run.sh: the backend ($label) did not report ready" >&2
    cat "$WORK/$label.err" >&2
    exit 1
}

FAILED=0

start_server main
echo "run.sh: backend on port $PORT, fixtures in $HOME_DIR"
python3 -I "$HERE/check.py" "$PORT" "$TOKEN" "$HOME_DIR" "$DATA_DIR" main || FAILED=1
stop

# A second server, with no sqlite3 on its PATH (an empty directory). The data dir is the same.
start_server nosqlite "$WORK/nobin"
echo "run.sh: backend without sqlite3 on port $PORT"
python3 -I "$HERE/check.py" "$PORT" "$TOKEN" "$HOME_DIR" "$DATA_DIR" nosqlite || FAILED=1
stop

if [ "$FAILED" -ne 0 ]; then
    # Keep the work folder (fixtures, data, server logs) for inspection.
    trap - EXIT
    stop
    echo "run.sh: FAILED - kept $WORK (server logs: main.err, nosqlite.err)" >&2
    exit 1
fi
echo "run.sh: all checks passed"
