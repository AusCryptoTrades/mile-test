#!/usr/bin/env bash
# Invoked only by the manually approved macOS workflow.
set -euo pipefail
umask 077
: "${RUNNER_TEMP:?}"
work="$RUNNER_TEMP/mile-signing"
keychain="$work/mile.keychain-db"
profile_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"

case "${1:-}" in
archive)
  : "${APPLE_DISTRIBUTION_P12_BASE64:?}" "${APPLE_DISTRIBUTION_P12_PASSWORD:?}" "${APPLE_PROVISIONING_PROFILE_BASE64:?}"
  mkdir "$work"
  printf '%s' "$APPLE_DISTRIBUTION_P12_BASE64" | base64 -D > "$work/distribution.p12"
  printf '%s' "$APPLE_PROVISIONING_PROFILE_BASE64" | base64 -D > "$work/mile.mobileprovision"
  security cms -D -i "$work/mile.mobileprovision" -o "$work/profile.plist"
  python3 - "$work" <<'PY'
from datetime import datetime, timezone
import os
from pathlib import Path
import plistlib
import re
import sys

work = Path(sys.argv[1])
team = os.environ['MILE_APPLE_TEAM_ID']
bundle = os.environ['MILE_IOS_BUNDLE_ID']
profile = plistlib.loads((work / 'profile.plist').read_bytes())
entitlements = profile['Entitlements']
uuid = profile['UUID']
if (team not in profile['TeamIdentifier']
    or entitlements['application-identifier'] != f'{team}.{bundle}'
    or entitlements.get('get-task-allow') is not False
    or profile.get('ProvisionedDevices') or profile.get('ProvisionsAllDevices')
    or profile['ExpirationDate'].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
    or entitlements.get('com.apple.developer.healthkit') is not True
    or entitlements.get('com.apple.developer.healthkit.background-delivery') is not True
    or not re.fullmatch(r'[A-Fa-f0-9-]{36}', uuid)):
    raise SystemExit('Expected a current App Store profile for the exact MILE beta ID, team and HealthKit entitlements.')
(work / 'uuid').write_text(uuid)
(work / 'export.plist').write_bytes(plistlib.dumps({
    'method': 'app-store-connect',
    'destination': 'export',
    'teamID': team,
    'signingStyle': 'manual',
    'signingCertificate': 'Apple Distribution',
    'provisioningProfiles': {bundle: uuid},
    'manageAppVersionAndBuildNumber': False,
    'uploadSymbols': False,
}))
PY
  uuid=$(cat "$work/uuid")
  mkdir -p "$profile_dir"
  cp "$work/mile.mobileprovision" "$profile_dir/$uuid.mobileprovision"
  keychain_password=$(openssl rand -hex 24)
  security create-keychain -p "$keychain_password" "$keychain"
  security set-keychain-settings -lut 1800 "$keychain"
  security unlock-keychain -p "$keychain_password" "$keychain"
  security import "$work/distribution.p12" -P "$APPLE_DISTRIBUTION_P12_PASSWORD" -k "$keychain" -T /usr/bin/codesign -T /usr/bin/security
  security list-keychains -d user -s "$keychain"
  security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" > /dev/null
  security find-identity -v -p codesigning "$keychain" | grep -Fq 'Apple Distribution:'
  unset keychain_password APPLE_DISTRIBUTION_P12_BASE64 APPLE_DISTRIBUTION_P12_PASSWORD APPLE_PROVISIONING_PROFILE_BASE64
  rm -f "$work/distribution.p12" "$work/mile.mobileprovision" "$work/profile.plist"

  project=native/ios/App/App.xcodeproj
  xcodebuild -project "$project" -scheme App -configuration Release \
    -destination 'generic/platform=iOS' -archivePath "$work/MILE.xcarchive" \
    DEVELOPMENT_TEAM="$MILE_APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
    PROVISIONING_PROFILE_SPECIFIER="$uuid" CURRENT_PROJECT_VERSION="$MILE_BUILD_NUMBER" archive \
    > "$work/archive.log" 2>&1 || { echo 'Signed archive failed. Review proposed signing configuration privately.' >&2; exit 1; }
  xcodebuild -exportArchive -archivePath "$work/MILE.xcarchive" \
    -exportPath "$work/export" -exportOptionsPlist "$work/export.plist" \
    > "$work/export.log" 2>&1 || { echo 'App Store export failed. Check the distribution profile and SDK.' >&2; exit 1; }
  packages=("$work/export/"*.ipa)
  [[ ${#packages[@]} -eq 1 && -f "${packages[0]}" ]]
  ditto -x -k "${packages[0]}" "$work/inspect"
  apps=("$work/inspect/Payload/"*.app)
  [[ ${#apps[@]} -eq 1 && -d "${apps[0]}" ]]
  app="${apps[0]}"
  codesign --verify --deep --strict "$app"
  codesign -d --entitlements - "$app" > "$work/entitlements.plist"
  plistbuddy=/usr/libexec/PlistBuddy
  test "$("$plistbuddy" -c 'Print :CFBundleIdentifier' "$app/Info.plist")" = "$MILE_IOS_BUNDLE_ID"
  test "$("$plistbuddy" -c 'Print :CFBundleVersion' "$app/Info.plist")" = "$MILE_BUILD_NUMBER"
  test "$("$plistbuddy" -c 'Print :com.apple.developer.healthkit' "$work/entitlements.plist")" = true
  test "$("$plistbuddy" -c 'Print :com.apple.developer.healthkit.background-delivery' "$work/entitlements.plist")" = true
  test "$("$plistbuddy" -c 'Print :application-identifier' "$work/entitlements.plist")" = "$MILE_APPLE_TEAM_ID.$MILE_IOS_BUNDLE_ID"
  "$plistbuddy" -c 'Print :NSHealthShareUsageDescription' "$app/Info.plist" > /dev/null
  plutil -lint "$app/PrivacyInfo.xcprivacy"
  printf 'Signed and verified staged iOS archive for commit `%s`, build %s.\n' "$GITHUB_SHA" "$MILE_BUILD_NUMBER" >> "$GITHUB_STEP_SUMMARY"
  ;;
upload)
  : "${APP_STORE_CONNECT_PRIVATE_KEY_BASE64:?}" "${APP_STORE_CONNECT_KEY_ID:?}" "${APP_STORE_CONNECT_ISSUER_ID:?}"
  [[ "$APP_STORE_CONNECT_KEY_ID" =~ ^[A-Z0-9]+$ ]]
  [[ "$APP_STORE_CONNECT_ISSUER_ID" =~ ^[A-Fa-f0-9-]{36}$ ]]
  # altool searches ./private_keys for AuthKey_<id>.p8.
  cd "$work"
  mkdir private_keys
  printf '%s' "$APP_STORE_CONNECT_PRIVATE_KEY_BASE64" | base64 -D > "private_keys/AuthKey_$APP_STORE_CONNECT_KEY_ID.p8"
  unset APP_STORE_CONNECT_PRIVATE_KEY_BASE64
  packages=(export/*.ipa)
  [[ ${#packages[@]} -eq 1 && -f "${packages[0]}" ]]
  xcrun altool --upload-app --type ios --file "${packages[0]}" --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
  ;;
cleanup)
  if [[ -f "$work/uuid" ]]; then
    uuid=$(cat "$work/uuid")
    if [[ "$uuid" =~ ^[A-Fa-f0-9-]{36}$ ]]; then rm -f "$profile_dir/$uuid.mobileprovision"; fi
  fi
  if [[ -e "$keychain" ]]; then security delete-keychain "$keychain" || true; fi
  rm -rf "$work"
  ;;
*) exit 2 ;;
esac
