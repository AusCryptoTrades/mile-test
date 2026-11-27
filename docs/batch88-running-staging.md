# MILE Running staging

Use the combined Running draft checkout to exercise Build and Analysis together. The local launcher serves a staging-only copy of the browser assets on loopback. It never edits the source assets and uses only the published client key from MILE Staging.

1. In the Supabase dashboard, open MILE Staging (`fnyfeelynaozxtftrrga`). Copy its publishable key from Connect.
2. Run `MILE_STAGING_PUBLISHABLE_KEY='<staging publishable key>' node scripts/serve-running-staging.mjs` at the repository root. Open `http://127.0.0.1:4186` in a separate browser profile.
3. Sign in with a confirmed synthetic staging account that already has an `av_members` row. For synthetic setup on the extended staging project, follow the [overnight staging runbook](overnight-release.md#reproducible-staging). Stage invitation redemption now requires the verified email and the Training Disclaimer receipt.
4. Create and review a plan, reload, and confirm the saved workouts and structured steps are present. Sign in as the second synthetic staging athlete in a different profile and verify the first athlete’s plan is absent.

The launcher limits browser connections to the staging Supabase API. Staging needs its own Auth redirect allowlist if you test email or password reset flows. Garmin account connection and delivery require the staging Edge Functions and provider configuration. Keep provider credentials and synthetic athlete passwords outside the repository.

## Review an evidence-backed revision

The consent migration adds an owner-scoped proposal and approval API. Run it after the original workout revision migration and follow it with the legacy Calendar ID migration. For the Running recovery policy, use a saved fatigue check-in of 7–10, an active personalised Running plan with recovery integration enabled, and a future aerobic distance workout within the next week. The server considers the latest saved check-in dated within the current worldwide calendar range. To protect same-day workouts, the session date must be later than the current date in UTC+14. Timed return sessions and workouts with a Garmin publication claim are ineligible.

1. As the first synthetic member, save the check-in and wait for cloud sync. Open a private running activity’s Analysis tab in the staging preview and select **Review recovery adjustment**.
2. Check the evidence date, before-and-after duration and distance, and exact workout steps. Close Analysis to leave the workout as saved, or reopen the review and select **Approve this revision**. Proposals expire after 20 minutes.
3. Reload the plan and confirm the new revision. In a second browser profile, check that the other synthetic member has access only to their own plan. Use an old copy in a second device session to confirm stale saves surface a conflict.

The proposal table, audit receipt, owner lock and approval APIs are shared across sports. Each additional sport needs its own evidence policy and prescription writer. The current policy uses self-reported evidence only and has no automatic execution path.
