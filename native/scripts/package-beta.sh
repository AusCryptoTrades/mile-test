#!/usr/bin/env bash
set -euo pipefail
: "${MILE_STAGING_PUBLISHABLE_KEY:?}"
output="$(realpath -m "${1:?Choose an output path}")"
build=$(git rev-parse HEAD)
export GITHUB_SHA="$build"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$output"
node scripts/serve-running-staging.mjs --output "$scratch/web"
MILE_NATIVE_STAGING_PUBLISHABLE_KEY="$MILE_STAGING_PUBLISHABLE_KEY" npm --prefix native run stage
for root in "$scratch/web" native/www; do
 for asset in index.html mile-running-build.js mile-cycling-build.js mile-swimming-build.js mile-onboarding.js mile-avatar.js mile-session.js mile-design.css mile-run-tracker.html; do
  test -s "$root/$asset"
 done
 if grep -Eq 'mgixvokjlytjuypzcfzz|https://app\.milefitness\.com\.au' "$root/index.html"; then
  echo 'Expected MILE Staging as the only app backend' >&2
  exit 1
 fi
done
grep -Fq "content=\"$build\"" "$scratch/web/index.html"
grep -Fq "$build" native/www/mile-build.json
grep -Fq 'connect-src https://fnyfeelynaozxtftrrga.supabase.co' "$scratch/web/_headers"
grep -Fq 'data-mile-native-session="true"' native/www/index.html
grep -Fq 'src="./sync/apple-app.mjs"' native/www/index.html
(cd "$scratch/web" && zip -qr -X "$output/mile-web-staging.zip" .)
(cd native/www && zip -qr -X "$output/mile-ios-staging-web-assets.zip" .)
python3 native/scripts/staging-apple-sql.py > "$output/mile-apple-staging.sql"
cp docs/private-runner-beta.md docs/batch92-apple-health.md "$output/"
printf 'Git commit %s\nWeb ZIP: staging preview. iOS ZIP: unsigned web assets used to build the iPhone app.\n' "$build" > "$output/BUILD.txt"
(cd "$output" && sha256sum ./*.zip ./mile-apple-staging.sql > SHA256SUMS)
