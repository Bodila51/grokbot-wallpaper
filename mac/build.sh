#!/bin/bash
# Builds "Grok Bot Wallpaper.app" (universal: Apple silicon + Intel, ad-hoc signed) and GrokBotWallpaper.dmg
# into mac/dist/. Needs a Mac with Xcode. Usage: bash mac/build.sh   (VERSION=1.0 stamps the version)
set -euo pipefail
cd "$(dirname "$0")"

VERSION="${VERSION:-0.1}"
BUILD_NUMBER="${BUILD_NUMBER:-1}"
NAME="Grok Bot Wallpaper"
APP="dist/$NAME.app"
DMG="dist/GrokBotWallpaper.dmg"

swift build -c release --arch arm64 --arch x86_64
BIN="$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/GrokBotWallpaper"

rm -rf dist
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/GrokBotWallpaper"
cp Resources/Info.plist "$APP/Contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$VERSION" "$APP/Contents/Info.plist"
plutil -replace CFBundleVersion -string "$BUILD_NUMBER" "$APP/Contents/Info.plist"
if [ -f Resources/AppIcon.icns ]; then
  cp Resources/AppIcon.icns "$APP/Contents/Resources/"
  plutil -replace CFBundleIconFile -string AppIcon "$APP/Contents/Info.plist"
fi

# Ad-hoc signature: no Apple Developer account, so on first launch macOS asks to confirm the app once (see README).
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --strict --verbose=2 "$APP"
lipo -info "$APP/Contents/MacOS/GrokBotWallpaper"

STAGE="dist/dmg"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/$NAME.app"
ln -s /Applications "$STAGE/Applications"
# hdiutil now and then fails with "Resource busy" on CI runners: try a few times
for attempt in 1 2 3 4 5; do
  if hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"; then break; fi
  if [ "$attempt" = 5 ]; then exit 1; fi
  sleep 5
done
rm -rf "$STAGE"
echo "Built $DMG ($VERSION)"
