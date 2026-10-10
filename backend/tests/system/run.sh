#!/usr/bin/env bash
# Unit tests of src/system (updates from the CDN, fixed settings) and of the settings rules
# in src/core/settings.nv. Compiles unit.nv against src/core, src/launch and src/system in a
# temporary tree, generates an update manifest and an installer fixture with python3 (so the
# SHA-512 values come from hashlib, not from the code under test), and runs the test binary.
# No network is needed: the manifest and the installer are fixtures.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-system-test.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/tree" "$WORK/fixtures" "$WORK/data"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/accounts" "$WORK/tree/accounts"
ln -s "$SRC/launch" "$WORK/tree/launch"
ln -s "$SRC/system" "$WORK/tree/system"
cp "$HERE/unit.nv" "$WORK/tree/main.nv"

python3 -I - "$WORK/fixtures" <<'EOF_PY' || exit 1
import base64, hashlib, json, os, sys
out = sys.argv[1]
payload = b"VoltLauncher fixture installer\n" * 40
with open(os.path.join(out, "update.bin"), "wb") as f:
    f.write(payload)
digest = hashlib.sha512(payload).digest()
with open(os.path.join(out, "update.sha512"), "w") as f:
    f.write(digest.hex())
entry = lambda name: {"name": name, "size": len(payload), "sha512": base64.b64encode(digest).decode()}
manifest = {
    "product": "VoltLauncher",
    "version": "0.2.0",
    "releaseDate": "2026-10-01T10:00:00.000Z",
    "notes": "Fixture notes",
    "platforms": {
        "linux_amd64": {"version": "0.2.0", "releaseDate": "2026-10-01T10:00:00.000Z",
                        "update": entry("VoltLauncher-0.2.0.AppImage"), "files": [entry("VoltLauncher-0.2.0.AppImage")]},
        "windows_x86_64": {"version": "0.2.0", "releaseDate": "2026-10-01T10:00:00.000Z",
                           "update": None, "files": [entry("VoltLauncher Setup 0.2.0.exe")]},
        "macos_arm64": {"version": "0.3.0-beta.1", "releaseDate": "2026-10-09T10:00:00.000Z",
                        "update": None, "files": [entry("VoltLauncher-0.3.0-beta.1.dmg")]},
        "linux_aarch64": {"version": "0.2.0", "releaseDate": "2026-10-01T10:00:00.000Z",
                          "update": {"name": "VoltLauncher-0.2.0.AppImage", "size": len(payload)}, "files": []}
    }
}
with open(os.path.join(out, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
EOF_PY

"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/system-unit" || exit 1
"$WORK/system-unit" "$WORK/fixtures" "$WORK/data"
