#!/usr/bin/env sh
# Builds the macOS arm64 release (DMG + ZIP). Run this on a Mac: the DMG needs hdiutil and
# sips, which only exist on macOS. Needs novusc on PATH and Node with pnpm.
#
# Signing and notarization are not configured: the output is unsigned. Set CSC_LINK and
# CSC_KEY_PASSWORD (or an identity) plus APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
# to sign and notarize.
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKEND_DIR="$APP_DIR/../backend"

mkdir -p "$BACKEND_DIR/dist/mac-arm64"
novusc build "$BACKEND_DIR/src/main.nv" --target aarch64-macos -o "$BACKEND_DIR/dist/mac-arm64/volt-backend"

cd "$APP_DIR"
pnpm install --frozen-lockfile
pnpm build
node scripts/package.mjs mac-arm64
