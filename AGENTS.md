# MILE development agent instructions

MILE is a single-file HTML application in `index.html`. Its test site deploys from `main`.

## Mandatory workflow
1. Make code changes on a dedicated branch. Never push untested feature fixes straight to `main`.
2. Identify the actual production event handler and rendering path before changing a feature. Multiple Activity Details and share implementations exist. Avoid stacking CSS overrides without proving which rules win.
3. Run `npm ci`, `npx playwright install chromium webkit`, and `npm run test:e2e`. Record exact failing tests; do not claim a pass without a completed run.
4. Add a regression test reproducing the original issue using the **actual app UI** wherever feasible. Fixture-only tests verify CSS mechanics, not logged-in activity workflows.
5. Test desktop Chromium, mobile Chromium, and mobile WebKit. Test viewport clipping, visible hit targets, and interactions, not only script syntax.
6. Never invent Garmin lap data. Differentiate real Garmin laps, derived estimates, and unavailable fields. Tests should use sanitized representative payloads.
7. Preserve calendar selected-date highlighting and Social Feed distance.
8. Open a pull request, inspect GitHub Actions results and screenshots, and merge only after checks pass and changes have been reviewed.
9. Reserve real-iPhone testing for iOS-specific Save to Photos / native share behaviour and private authenticated Garmin activity verification.
10. If automated browser tests cannot authenticate, report the gap; never mark authenticated features as passing based on mock overlays.

## Known issues
- Activity Details Back button obscured or not clickable on iPhone
- Oversized Activity Details black header/banner
- Heart-rate and pace charts clipped or labels unreadable on phone
- iPhone PNG creation and Save to Photos flow
- Garmin kilometre split data missing or not parsed

## Testing commands
- `npm run test:e2e`: all configured browsers
- `npm run test:e2e:desktop`: desktop Chromium
- `npm run test:e2e:mobile`: mobile WebKit

## User feedback
Do not request broad manual regression testing after every commit. Report evidence-backed automated results and request only narrowly scoped real-device checks.

## Release boundaries

- Use synthetic accounts and fixtures. Inspect the exact migration ledger on MILE Staging `fnyfeelynaozxtftrrga`. Keep the production project `mgixvokjlytjuypzcfzz` read-only until explicit owner release approval.
- Work on isolated branches and keep existing review branches intact. Treat hosted Auth, Storage and real Garmin validation as separate gates from mocked browser runs and isolated SQL.
- Preserve manual consent and revision checks. Keep automated Garmin matching, adaptive decisions and republication disabled until their provider, coaching and owner approval gates pass.
- See [design](MILE-DESIGN.md), [roadmap](MILE-ROADMAP.md), [status](MILE-STATUS.md) and the [release runbook](docs/overnight-release.md).
