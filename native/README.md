# MILE native foundations — Batch 83

Experimental, unsigned build pipeline for the current shared web app. No production authentication, deployment, or database changes. The existing root package and lockfile remain untouched.

## Commands
Use Node 22+, Xcode 26+ on macOS for iOS, Android SDK and Java 21 for Android.
- npm test (asset staging and manifest verification)
- npm install (exact Capacitor 8.0.0 direct dependencies; initial lockfile still needs to be captured/reviewed before release)
- npm run prepare:ios or npm run prepare:android (fresh checkout only; generates platform projects)
- npm run sync (after generated platforms exist)

The pipeline compiles a debug Android APK and unsigned iOS simulator application without signing credentials. It does not upload to a store or publish installable artifacts. Generated projects are intentionally ignored for the initial compile spike; commit reviewed native platform projects and lockfile before adding native changes or signing. Bundle ID au.com.milefitness.training.dev is provisional and not registered. Confirm permanent ID and legal entity before production signing.

## Acceptance gates after compile
- Verify local app navigation, iframe same-origin messaging, native back, safe areas, keyboards and themes.
- Verify actual-device login/logout, secure token storage, Supabase CORS, recovery/deep links, Garmin connection/import.
- Implement and test native permissions, foreground/background GPS, share/download and lifecycle.
- Review privacy, deletion, moderation, health declarations, signing, store requirements.
- No new production secrets, service-role keys, signing certificates or user data in repo. Audit historical public code before making repository private; do not assume staging allowlist removes any secrets already in runtime files.
- Existing root Playwright suite remains the web regression gate. Native compile is not a real-device or authenticated behavior pass.
- No final production domain or store account assumed. Keep the marketing site, domain/email and Cloudflare/private-repository migration separate.
