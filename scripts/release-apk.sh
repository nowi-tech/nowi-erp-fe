#!/usr/bin/env bash
# Cut a new NOWI ERP Android release: bump version → build signed APK →
# upload to the public bucket → update the auto-update manifest.
#
#   ./scripts/release-apk.sh <versionName> ["release notes"]
#   ./scripts/release-apk.sh 1.3 "Faster dispatch screen"
#
# versionCode is auto-incremented from android/app/build.gradle.
# The download link is STABLE (same object), so it never needs resharing.
# Requires: signed keystore present (android/keystore.properties), gcloud
# authed with write access to the bucket, Android SDK at $ANDROID_HOME.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION_NAME="${1:-}"
NOTES="${2:-Bug fixes and improvements.}"
BUCKET="gs://nowi-erp-apk"
PROJECT="nowi-erp-496406"
GRADLE="android/app/build.gradle"
APK_OUT="android/app/build/outputs/apk/release/app-release.apk"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
export ANDROID_HOME

if [[ -z "$VERSION_NAME" ]]; then
  echo "usage: $0 <versionName> [\"release notes\"]   e.g. $0 1.3 \"…\"" >&2
  exit 1
fi
if [[ ! -f android/keystore.properties ]]; then
  echo "error: android/keystore.properties missing — restore the signing keystore" >&2
  echo "       (Secret Manager: ANDROID_KEYSTORE_BASE64 / _PASSWORD / ANDROID_KEY_ALIAS, project $PROJECT)" >&2
  exit 1
fi

CUR_CODE="$(grep -E 'versionCode[[:space:]]+[0-9]+' "$GRADLE" | grep -oE '[0-9]+' | head -1)"
NEW_CODE=$((CUR_CODE + 1))
echo "[release] versionCode $CUR_CODE → $NEW_CODE, versionName → $VERSION_NAME"

# Bump build.gradle in place (BSD/macOS sed).
sed -i '' -E "s/versionCode[[:space:]]+[0-9]+/versionCode $NEW_CODE/" "$GRADLE"
sed -i '' -E "s/versionName[[:space:]]+\"[^\"]*\"/versionName \"$VERSION_NAME\"/" "$GRADLE"

echo "[release] pnpm build + cap sync"
pnpm build >/dev/null
npx cap sync android >/dev/null

echo "[release] gradle assembleRelease"
( cd android && ./gradlew assembleRelease -q )

BT="$(/bin/ls "$ANDROID_HOME/build-tools/" | sort -V | tail -1)"
"$ANDROID_HOME/build-tools/$BT/apksigner" verify "$APK_OUT" >/dev/null \
  && echo "[release] APK signature OK"

echo "[release] upload APK + latest.json"
# Stable filename for the in-app auto-update flow — never changes. The
# manifest at latest.json always points here.
gcloud storage cp "$APK_OUT" "$BUCKET/nowi-erp.apk" \
  --project "$PROJECT" --cache-control="no-cache, max-age=0" >/dev/null

# Versioned filename for manual sideload sharing. Chrome refuses to
# re-save a file with the same name as one already in Downloads, so a
# unique name per release makes "tap the link, install" actually work
# without users having to delete the old APK first.
VERSIONED_NAME="nowi-erp-v$VERSION_NAME.apk"
gcloud storage cp "$APK_OUT" "$BUCKET/$VERSIONED_NAME" \
  --project "$PROJECT" --cache-control="no-cache, max-age=0" >/dev/null

TMP_MANIFEST="$(mktemp)"
trap 'rm -f "$TMP_MANIFEST"' EXIT
cat > "$TMP_MANIFEST" <<JSON
{
  "versionCode": $NEW_CODE,
  "versionName": "$VERSION_NAME",
  "url": "https://storage.googleapis.com/nowi-erp-apk/nowi-erp.apk",
  "notes": "$NOTES"
}
JSON
gcloud storage cp "$TMP_MANIFEST" "$BUCKET/latest.json" \
  --project "$PROJECT" --cache-control="no-cache, max-age=0" >/dev/null

echo
echo "[release] DONE — v$VERSION_NAME (versionCode $NEW_CODE) live."
echo "  Stable   : https://storage.googleapis.com/nowi-erp-apk/nowi-erp.apk"
echo "  Versioned: https://storage.googleapis.com/nowi-erp-apk/$VERSIONED_NAME"
echo "  Note  : commit the build.gradle version bump, and DEPLOY THE FE to"
echo "          Vercel — the in-app update prompt only fires from the"
echo "          deployed bundle, not from the freshly built APK."
