# MILE mobile launch and public website roadmap
25 November 2026. Preliminary source audit of PR 106 at dfcbff73dec1cea42e49732c0329a055350f34c3. Planning only; not a native build or compliance certification.

## Release gate
Finish PR 106: original combined run 415 passed, 3 failed, 8 skipped. All failures were the same old seven-preference reset expectation; corrected to eight plus announcement reset check. Require fresh full browser/layout/API results, merge with expected head SHA, verify deployment. Review older superseded PRs separately. Finish unresolved Batch 82 functional, real-device, authenticated and security checks.

## Native workstream (parallel where safe)
- Existing static index.html (~1.03 MB), tracker, SIM, shared CSS/scripts are candidates for local bundled assets via Capacitor. package.json currently declares Playwright only; no native build has been validated.
- Inventory all runtime assets, create reproducible webDir staging script excluding tests/docs/secrets, add pinned Capacitor dependencies and both platform projects on dedicated branch.
- Verify iframe same-origin messaging, relative navigation, native back, safe areas, keyboard, share/download, permissions, auth persistence and secure token storage. Existing tracker uses browser geolocation and visibilitychange; native lifecycle/background tracking requires actual device tests.
- Verify Supabase CORS/allowed origins and OAuth/password recovery callbacks for native schemes; test Garmin connection and data import, real sign-in, sign-out, account isolation. No production configuration change without validation.
- Establish unsigned CI compilation first, then iOS signing/TestFlight and Android signing/internal testing, secrets stored only in approved CI secret store. Use physical iPhone and Android testing before external distribution.
- Confirm store account eligibility before fees: Apple guideline 5.1.1(ix) sensitive user data/legal entity; Google organisation account rules for applicable health apps. If eligible personal Google account, 12 continuously opted-in testers for 14 days before production access application. Recruit 15–20 Android testers; iOS independent.
- Verify privacy disclosures, account deletion inside app and public request URL as applicable, UGC moderation/report/block, support contact, reviewer demo account, data safety/health declarations, permissions, privacy manifests, SDK/target versions, icons/screenshots, metadata. Do not claim store compliance until verified.
- Native HealthKit, Health Connect, COROS and other integrations separate from initial installable internal beta; determine public release acceptance criteria based on real beta.
Sources: https://capacitorjs.com/docs/getting-started ; https://developer.apple.com/app-store/review/guidelines/ ; https://support.google.com/googleplay/android-developer/answer/13634885 ; https://support.google.com/googleplay/android-developer/answer/14151465

## Public website and business email (parallel)
Proposed single brand domain milefitness.com, availability/rights unverified. Separate marketing site repo/deployment from athlete app. Home features MILE Training (first product), MILE Nutrition and MILE Coaching (future, clearly marked coming soon). Individual /training, /nutrition, /coaching landing pages; /beta for signup, platform selector, approved TestFlight/Play links only; /support, /privacy, /terms, /delete-account. Store badges only once real links exist. Optional app subdomain for existing web access; plan OAuth redirect/domain migration deliberately. Do not expose admin UI publicly without auth.
Register domain after ownership/brand checks. Email hosting is separate from web hosting; one mailbox info@ with support/privacy aliases initially; configure MX, SPF, DKIM, DMARC. No account purchases or DNS changes made. Site can launch early as coming-soon/beta recruitment, with no fabricated screenshots/features. Preserve monochrome/lime MILE brand.
## Planning sequence
Release gate + domain/business identity verification; native compatibility spike and website proof in parallel; signed internal builds; closed beta and Android tester recruitment; release compliance and real-device signoff; public store listings and switch website CTAs to official links. Dates are targets, not guarantees. User approves product names, domain, website proof, and paid services before purchase.
