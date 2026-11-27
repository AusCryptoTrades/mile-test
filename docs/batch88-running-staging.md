# MILE Running staging

Use the combined Running draft checkout to exercise Build and Analysis together. The local launcher serves a staging-only copy of the browser assets on loopback. It never edits the source assets and uses only the published client key from MILE Staging.

1. In the Supabase dashboard, open MILE Staging (`fnyfeelynaozxtftrrga`). Copy its publishable key from Connect.
2. Run `MILE_STAGING_PUBLISHABLE_KEY='<staging publishable key>' node scripts/serve-running-staging.mjs` at the repository root. Open `http://127.0.0.1:4186` in a separate browser profile.
3. Sign in with a confirmed synthetic staging account that already has an `av_members` row. For this core-schema environment, an owner can create the synthetic users through Supabase Authentication and create their membership rows in the staging SQL Editor. The staging invitation RPC is not installed.
4. Create and review a plan, reload, and confirm the saved workouts and structured steps are present. Sign in as the second synthetic staging athlete in a different profile and verify the first athlete’s plan is absent.

The launcher limits browser connections to the staging Supabase API. Staging needs its own Auth redirect allowlist if you test email or password reset flows. Garmin account connection and delivery require the staging Edge Functions and provider configuration. Keep provider credentials and synthetic athlete passwords outside the repository.
