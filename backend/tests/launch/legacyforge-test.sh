#!/usr/bin/env bash
# Legacy Forge install (Minecraft 1.12.2 and older, src/launch/legacyforge.nv), needs network:
#
#   tests/launch/legacyforge-test.sh
#
# 1. Downloads the real installer forge-1.12.2-14.23.5.2847-installer.jar into a temporary
#    directory (it is read as a zip, never run).
# 2. Writes two fixture installers: no-profile.jar (no install_profile.json) and no-universal.jar
#    (install_profile.json without the universal jar).
# 3. Compiles legacyforge-unit.nv against src/core, src/accounts and src/launch in a temporary tree
#    and runs it: the branch choice (1.13+ keeps the headless path), the legacy install with the
#    real installer, the library plan, the 500 internal answers of the fixtures.
# 4. Checks the files from outside: the universal jar's SHA-1 equals the SHA-1 of the zip entry
#    (unzip -p), and the version JSON is written with the id of its folder.
#
# Needs novusc (NOVUSC overrides it), curl, unzip, sha1sum and python3. Exits non-zero on failure.
set -u
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC=$(CDPATH= cd -- "$HERE/../../src" && pwd)
NOVUSC=${NOVUSC:-novusc}
URL=https://maven.minecraftforge.net/net/minecraftforge/forge/1.12.2-14.23.5.2847/forge-1.12.2-14.23.5.2847-installer.jar
ID=1.12.2-forge1.12.2-14.23.5.2847
FAILURES=0
CHECKS=0
WORK=$(mktemp -d "${TMPDIR:-/tmp}/volt-legacyforge-test.XXXXXX")
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

check() { # check NAME CONDITION-EXIT-STATUS
    local name=$1 status=$2
    CHECKS=$((CHECKS + 1))
    if [ "$status" -eq 0 ]; then
        echo "ok    $name"
    else
        FAILURES=$((FAILURES + 1))
        echo "FAIL  $name"
    fi
}

mkdir -p "$WORK/tree" "$WORK/installer" "$WORK/fixtures" "$WORK/data"
ln -s "$SRC/core" "$WORK/tree/core"
ln -s "$SRC/accounts" "$WORK/tree/accounts"
ln -s "$SRC/launch" "$WORK/tree/launch"
cp "$HERE/legacyforge-unit.nv" "$WORK/tree/main.nv"
INSTALLER="$WORK/installer/forge-1.12.2-14.23.5.2847-installer.jar"

# 1. the real installer
curl -sS -L --fail -o "$INSTALLER" "$URL" || { echo "FAIL  download of $URL"; exit 1; }
check "the real installer is downloaded ($(stat -c %s "$INSTALLER") bytes)" $([ -s "$INSTALLER" ] && echo 0 || echo 1)

# 2. the fixtures, built with the zip module of python (no other code runs)
python3 -I - "$INSTALLER" "$WORK/fixtures" <<'EOF'
import sys, zipfile, os
installer, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(installer) as z:
    profile = z.read("install_profile.json")
with zipfile.ZipFile(os.path.join(out, "no-profile.jar"), "w") as z:
    z.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\n")
with zipfile.ZipFile(os.path.join(out, "no-universal.jar"), "w") as z:
    z.writestr("install_profile.json", profile)
EOF
check "the fixtures are written" $?

# 3. the unit checks
"$NOVUSC" build "$WORK/tree/main.nv" -o "$WORK/legacyforge-unit" || { echo "FAIL  unit checks do not build"; exit 1; }
if "$WORK/legacyforge-unit" "$INSTALLER" "$WORK/data" "$WORK/fixtures"; then
    check "unit checks" 0
else
    check "unit checks (see above)" 1
fi

# 4. the files, checked from outside the launcher
UNIVERSAL=$(python3 -I - "$INSTALLER" <<'EOF'
import sys, json, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    print(json.loads(z.read("install_profile.json"))["install"]["filePath"])
EOF
)
LIB="$WORK/data/shared/libraries/net/minecraftforge/forge/1.12.2-14.23.5.2847/forge-1.12.2-14.23.5.2847.jar"
[ -f "$LIB" ]; check "the universal jar is at libraries/net/minecraftforge/forge/1.12.2-14.23.5.2847/" $?
ZIP_SHA=$(unzip -p "$INSTALLER" "$UNIVERSAL" | sha1sum | cut -d' ' -f1)
FILE_SHA=$(sha1sum "$LIB" | cut -d' ' -f1)
echo "      zip entry $UNIVERSAL sha1 $ZIP_SHA"
echo "      extracted file sha1       $FILE_SHA"
[ -n "$ZIP_SHA" ] && [ "$ZIP_SHA" = "$FILE_SHA" ]; check "the extracted jar has the SHA-1 of the zip entry" $?

VJSON="$WORK/data/shared/versions/$ID/$ID.json"
[ -f "$VJSON" ]; check "the version JSON is at versions/$ID/$ID.json" $?
python3 -I - "$INSTALLER" "$VJSON" "$ID" <<'EOF'
import sys, json, zipfile, os
installer, written, folder_id = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(installer) as z:
    expected = json.loads(z.read("install_profile.json"))["versionInfo"]
with open(written, encoding="utf-8") as f:
    got = json.load(f)
ok = got.get("id") == folder_id == os.path.basename(os.path.dirname(written)) == expected["id"]
ok = ok and got == expected and got.get("mainClass") == expected.get("mainClass")
print("      version json id " + str(got.get("id")) + ", folder " + os.path.basename(os.path.dirname(written)) + ", equal to versionInfo: " + str(got == expected))
sys.exit(0 if ok else 1)
EOF
check "the version JSON id matches its folder and the installer's versionInfo" $?

echo "legacyforge-test: $((CHECKS - FAILURES)) / $CHECKS checks passed"
[ "$FAILURES" -eq 0 ]
