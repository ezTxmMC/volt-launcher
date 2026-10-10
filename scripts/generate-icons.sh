#!/usr/bin/env bash
#
# Generates every app-icon format the build scripts and electron-builder expect
# from a single source image.
#
# Source (first one found wins):
#   packaging/icon.svg   - preferred, scales cleanly to 1024px
#   packaging/icon.png   - should be at least 1024x1024, square, transparent
#
# Run this once after changing the logo; the generated files are committed so
# that building does not require ImageMagick on every machine.

set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE_SVG="packaging/icon.svg"
SOURCE_PNG="packaging/icon.png"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MASTER="$WORK/master.png"

if [ -f "$SOURCE_SVG" ]; then
    echo "Source: $SOURCE_SVG"
    if command -v rsvg-convert &> /dev/null; then
        rsvg-convert -w 1024 -h 1024 "$SOURCE_SVG" -o "$MASTER"
    elif command -v magick &> /dev/null; then
        magick -background none -density 384 "$SOURCE_SVG" -resize 1024x1024 "$MASTER"
    else
        echo "ERROR: need rsvg-convert or ImageMagick to rasterize the SVG." >&2
        exit 1
    fi
elif [ -f "$SOURCE_PNG" ]; then
    echo "Source: $SOURCE_PNG"
    magick "$SOURCE_PNG" -resize 1024x1024 -background none -gravity center -extent 1024x1024 "$MASTER"
else
    echo "ERROR: no source icon found. Put a square logo at $SOURCE_PNG (>=1024x1024) or $SOURCE_SVG." >&2
    exit 1
fi

if ! command -v magick &> /dev/null; then
    echo "ERROR: ImageMagick (magick) is required." >&2
    exit 1
fi

png() { magick "$MASTER" -resize "${1}x${1}" -depth 8 -strip "$2"; echo "  $2 (${1}x${1})"; }

echo "Generating..."

mkdir -p packaging/linux packaging/macos packaging/windows ui/icons ui/electron ui/public

# --- Linux: .desktop / AppImage / .deb icon (build-linux.sh) ---
png 256 packaging/linux/voltlauncher.png

# --- Windows: icon for the GraalVM native volt-launcher.exe (build-windows.bat) ---
magick "$MASTER" -define icon:auto-resize=256,128,64,48,32,16 packaging/windows/voltlauncher.ico
echo "  packaging/windows/voltlauncher.ico"

# --- macOS: .app bundle icon (build-macos.sh, referenced by Info.plist) ---
# ImageMagick has no ICNS write delegate on most Linux builds - it silently
# writes a PNG under an .icns name - so the container is packed separately.
ICNS_ARGS=()
for size in 16 32 64 128 256 512 1024; do
    magick "$MASTER" -resize "${size}x${size}" -depth 8 -strip "$WORK/icon_$size.png"
    ICNS_ARGS+=("$size:$WORK/icon_$size.png")
done
python3 scripts/make-icns.py packaging/macos/AppIcon.icns "${ICNS_ARGS[@]}"
echo "  packaging/macos/AppIcon.icns"

# --- electron-builder: embeds these into the packaged electron binary ---
png 512 ui/icons/icon.png
cp packaging/windows/voltlauncher.ico ui/icons/icon.ico
echo "  ui/icons/icon.ico"
cp packaging/macos/AppIcon.icns ui/icons/icon.icns
echo "  ui/icons/icon.icns"

# --- Runtime: BrowserWindow icon (Linux window + taskbar) ---
png 256 ui/electron/icon.png

# --- Browser tab / dev server ---
magick "$MASTER" -define icon:auto-resize=64,48,32,16 ui/public/favicon.ico
echo "  ui/public/favicon.ico"

echo "Done."
