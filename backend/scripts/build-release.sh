#!/usr/bin/env sh
# Cross-compiles the backend for every release target into dist/<os>-<arch>/.
#
#   linux-x64    x86_64-linux-musl   static (runs on any distribution)
#   linux-arm64  aarch64-linux-musl  static
#   win-x64      x86_64-windows-gnu  volt-backend.exe
#   win-arm64    aarch64-windows-gnu volt-backend.exe
#   mac-arm64    aarch64-macos       not runnable on Linux; build on macOS if you need to test it
#
# Needs novusc and zig (zig cc does the cross compilation). Works from any working directory.
# Pass target names to build only some of them: build-release.sh linux-x64 win-x64
set -eu

BACKEND_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NOVUSC=${NOVUSC:-novusc}

if ! command -v "$NOVUSC" >/dev/null 2>&1; then
    echo "build-release.sh: '$NOVUSC' not found on PATH (set NOVUSC=/path/to/novusc)" >&2
    exit 1
fi

build_one() {
    name=$1
    triple=$2
    cflags=$3
    binary=$4
    out_dir="$BACKEND_DIR/dist/$name"
    mkdir -p "$out_dir"
    echo "build-release.sh: $name ($triple)" >&2
    if [ -n "$cflags" ]; then
        "$NOVUSC" build "$BACKEND_DIR/src/main.nv" --target "$triple" --cflags "$cflags" -o "$out_dir/$binary"
    else
        "$NOVUSC" build "$BACKEND_DIR/src/main.nv" --target "$triple" -o "$out_dir/$binary"
    fi
}

# No arguments means every target; otherwise only the named ones.
ALL_TARGETS="$*"
want() {
    [ -z "$ALL_TARGETS" ] && return 0
    for t in $ALL_TARGETS; do
        [ "$t" = "$1" ] && return 0
    done
    return 1
}

want linux-x64 && build_one linux-x64 x86_64-linux-musl -static volt-backend
want linux-arm64 && build_one linux-arm64 aarch64-linux-musl -static volt-backend
want win-x64 && build_one win-x64 x86_64-windows-gnu "" volt-backend.exe
want win-arm64 && build_one win-arm64 aarch64-windows-gnu "" volt-backend.exe
want mac-arm64 && build_one mac-arm64 aarch64-macos "" volt-backend
echo "build-release.sh: done" >&2
