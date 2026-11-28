# Combined MILE beta preview

Use the **Combined beta download** artifact for the reviewed integration commit. It replaces the Running-only download for this preview and contains Running Build, Intelligence, MILE IQ, Athlete Onboarding and the UI audit. It targets MILE Staging `fnyfeelynaozxtftrrga`.

## Deploy the verified package

1. Download `mile-combined-beta-staging` from the integration PR's **Combined beta download** check. Confirm the SHA in the `mile-beta-build` meta tag in `index.html` matches the reviewed head. Use the ZIP as delivered for Direct Upload. Extract it first for the CLI.
2. Use an existing, owner-approved **non-production** Cloudflare Pages project. Enable Access for **preview deployments** and allow only the two approved tester inboxes. Use **Deployments → Create deployment → Preview** with branch `mile-combined-beta` and upload the ZIP. For a Git-integrated Pages project, use the package directory and an authenticated Wrangler CLI.

   ```sh
   npx wrangler pages deploy ./mile-combined-beta-staging \
     --project-name <existing-non-production-project> --branch mile-combined-beta
   ```

   Confirm that Cloudflare lists the deployment as a preview. Copy its exact HTTPS URL. In a private browser, confirm Access challenges unauthorised users before the app can load. Confirm the response includes `Cache-Control: no-store` and a staging-only `connect-src` policy. Use a fresh browser profile for the preview.
3. In **MILE Staging → Authentication → URL Configuration**, set Site URL to that exact preview origin. Allow the origin and its `/mile-reset-password.html` redirect. Keep email confirmation enabled and verify that existing authorised mail delivery can reach both inboxes. Run the [two-inbox staging invitation script](../supabase/staging/create-running-beta-invites.sql) only in MILE Staging with the approved inboxes. Keep each invite private.
4. Confirm the staging migration ledger through `20261127183210 running_whole_km_recovery`. Confirm the private `mile-avatars` bucket and deployed onboarding and revision prerequisites against the [release runbook](overnight-release.md). The ZIP is a frontend package. It applies neither migrations nor Edge Function deployments.
5. Walk through invite, email verification, consent, onboarding, sign-out and return. Use synthetic photos to verify owner and approved follower access and denied access after revocation. Check profile photos in the app, Tracker and Challenges. Review a Running programme, compare the Calendar steps and start it in Tracker. On a physical iPhone, check editing with the keyboard showing, touch targets, native sharing and Save to Photos.

## Garmin sandbox gate

Test onboarding with **Skip for now** until an approved Garmin sandbox connection is ready. Follow the [Garmin sandbox instructions](running-beta.md#owner-steps-for-garmin-sandbox-access). Use staging ingestion, staging Edge Functions, the registered staging OAuth callback and `MILE_GARMIN_BETA_ORIGIN` set to the exact protected HTTPS preview origin. Verify one synthetic publication and readback. Use the [controlled watch check](garmin-step-check.md) for real step transitions and the [identity fixture instructions](overnight-release.md#minimum-garmin-identity-fixture) for manual matching. Keep automatic matching, adaptation and republication disabled. Obtain the existing coaching approval before anyone performs a generated plan.

## Reproduce or roll back

At the verified Git commit, set `MILE_STAGING_PUBLISHABLE_KEY` to the public key from MILE Staging. Run `node scripts/serve-running-staging.mjs --output ./mile-combined-beta-staging` into a new directory. Zip its contents with `index.html` and `_headers` at the archive root. For a loopback preview, omit `--output`.

Keep the previous staging preview available. If a hosted check fails, restrict the new preview or return testers to the previous verified preview. Preserve consent records, matches, workouts and photos. Production release is a separate approval.
