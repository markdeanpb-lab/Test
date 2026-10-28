#!/usr/bin/env bash
# Builds the EWR Android APK: Winlator 11.2 (Wine + Box64) with the EWR launcher patch,
# the unmodified EWR 4.0 Update 2 files and Microsoft's VB6 runtime bundled inside.
#
# Usage: ./build.sh /path/to/ewr42.zip [work-dir]
# Needs: git, unzip, zip, curl, cabextract, sha256sum, JDK 17+, Android SDK (ANDROID_HOME)
#        with platform 35, build-tools 35, NDK 24.0.8215888 and CMake 3.22.1.
set -euo pipefail

WINLATOR_APP_REPO="https://github.com/brunodev85/winlator-app"
WINLATOR_APP_COMMIT="8077f374ef2d54127b088de9e8cd7b4af14d9c8b"   # Winlator 11.2 app source
VBRUN_URL="https://download.microsoft.com/download/vb60pro/install/6/win98me/en-us/vbrun60.exe"
VBRUN_SHA256="ab0220420f5af23898b6a29861d0c4e0702990d6048ea9b40dc7935c7d6228db"

EWR_ZIP="$(realpath "${1:?usage: $0 /path/to/ewr42.zip [work-dir]}")"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$(realpath -m "${2:-$SCRIPT_DIR/work}")"
: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"

mkdir -p "$WORK_DIR"
APP_DIR="$WORK_DIR/winlator-app"

if [ ! -d "$APP_DIR/.git" ]; then
    GIT_LFS_SKIP_SMUDGE=1 git clone --depth 50 "$WINLATOR_APP_REPO" "$APP_DIR"
fi
git -C "$APP_DIR" fetch --depth 50 origin "$WINLATOR_APP_COMMIT" 2>/dev/null || true
git -C "$APP_DIR" checkout -f "$WINLATOR_APP_COMMIT"
git -C "$APP_DIR" clean -fdq app/src/main/java app/src/main/assets/ewr
git -C "$APP_DIR" apply "$SCRIPT_DIR/winlator-ewr.patch"

ASSETS="$APP_DIR/app/src/main/assets/ewr"
rm -rf "$ASSETS" "$WORK_DIR/ewr-src" "$WORK_DIR/vbrun"
mkdir -p "$ASSETS" "$WORK_DIR/ewr-src" "$WORK_DIR/vbrun"

# The original game, byte for byte, re-zipped with EWRevenge.exe at the root.
unzip -q "$EWR_ZIP" -d "$WORK_DIR/ewr-src"
EXE="$(find "$WORK_DIR/ewr-src" -iname EWRevenge.exe | head -n 1)"
[ -n "$EXE" ] || { echo "EWRevenge.exe not found in $EWR_ZIP" >&2; exit 1; }
(cd "$(dirname "$EXE")" && zip -q -r -X "$ASSETS/game.zip" .)

# MSVBVM60.DLL from Microsoft's own VB6 runtime redistributable (the only DLL EWR needs that Wine lacks).
curl -fsSL -o "$WORK_DIR/vbrun/vbrun60.exe" "$VBRUN_URL"
echo "$VBRUN_SHA256  $WORK_DIR/vbrun/vbrun60.exe" | sha256sum -c -
cabextract -q -F msvbvm60.dll -d "$WORK_DIR/vbrun" "$WORK_DIR/vbrun/vbrun60.exe"
cp "$WORK_DIR/vbrun/msvbvm60.dll" "$ASSETS/msvbvm60.dll"

echo "sdk.dir=$ANDROID_HOME" > "$APP_DIR/local.properties"
(cd "$APP_DIR" && chmod +x gradlew && ./gradlew --no-daemon assembleDebug)

cp "$APP_DIR/app/build/outputs/apk/debug/app-debug.apk" "$SCRIPT_DIR/EWR-Android.apk"
echo "Built $SCRIPT_DIR/EWR-Android.apk"
