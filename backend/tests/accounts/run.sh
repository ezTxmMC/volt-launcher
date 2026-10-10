#!/usr/bin/env bash
# Unit tests of src/accounts: compiles unit.nv against src/core, src/accounts and src/launch in a
# temporary tree (so the other feature modules are not needed), generates PNG skin fixtures with
# python3 and runs the test binary. Some checks call the real Microsoft, Xbox and Minecraft
# endpoints with fake tokens and therefore need network access. Needs curl and python3.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-accounts-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/tree" "$WORK/fixtures" "$WORK/data"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/accounts" "$WORK/tree/accounts"
ln -s "$SRC/launch" "$WORK/tree/launch"
cp "$HERE/unit.nv" "$WORK/tree/main.nv"

python3 -I - "$WORK/fixtures" <<'EOF' || exit 1
import struct, sys, zlib, os
out = sys.argv[1]

def png(width, height):
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row += bytes([(x * 4) % 256, (y * 4) % 256, 128, 255])
        rows.append(bytes(row))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))

for name, (w, h) in {'skin64.png': (64, 64), 'skin64x32.png': (64, 32), 'skin128.png': (128, 128)}.items():
    with open(os.path.join(out, name), 'wb') as f:
        f.write(png(w, h))
EOF

"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/accounts-unit" || exit 1
"$WORK/accounts-unit" "$WORK/fixtures" "$WORK/data"
