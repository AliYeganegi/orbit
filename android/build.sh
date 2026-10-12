#!/usr/bin/env bash
# Builds Orbit APK without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$HOME"/.jdks/jdk-17* | head -1)}"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
# DEBUG=1 makes the WebView inspectable over adb (chrome://inspect); never ship it

rm -rf build && mkdir -p build/gen build/classes build/dex build/assets
# web UI is shared with the iPhone PWA; service worker and PWA icons are not needed in the APK
cp -r ../web build/assets/www
rm -f build/assets/www/sw.js build/assets/www/manifest.webmanifest build/assets/www/icon-*.png
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -I "$JAR" --manifest AndroidManifest.xml -A build/assets build/res.zip \
  --java build/gen --min-sdk-version 26 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" ${DEBUG:+--debug-mode} -o build/unsigned.apk
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -classpath "$BT/core-lambda-stubs.jar" -d build/classes \
  $(find src build/gen -name '*.java')
"$BT/d8" --release --min-api 26 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
(cd build/dex && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk

KS="${KEYSTORE:-$HOME/.android/orbit.keystore}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -alias orbit -storepass orbit123 -keypass orbit123 \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Orbit" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:orbit123 --ks-key-alias orbit --out build/Orbit.apk build/aligned.apk
echo "Built: $(pwd)/build/Orbit.apk ($(du -h build/Orbit.apk | cut -f1))"
