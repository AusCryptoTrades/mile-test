# Batch 89 athlete onboarding

## Data ownership

- Authentication and verified email stay in Supabase Auth. Invitation redemption stays in `av_join`. The authenticated membership row owns the setup cursor, compare-and-swap revision and completion timestamp.
- `mile_profiles` continues to own social identity, avatar, disciplines and privacy. The onboarding save uses the same profile row as the existing editor. The `mile-avatars` bucket is public by design, with owner-only writes. A private profile limits discovery and content access through the existing social policies. The avatar can still be viewed if someone has its URL.
- `av_training_data.settings.athleteProfile` owns private baseline measurements and benchmarks. Height and weight are stored in centimetres and kilograms. Units reuse `settings.preferences776.appearance`. The existing athlete profile reader and Settings edit the same private fields. Sport-specific programme defaults take precedence over the general experience setting.
- Garmin continues to own connection status through the existing OAuth and settings flow. Setup stores a completed step rather than a second connection record.

The migration leaves all preexisting memberships at a null setup stage. New memberships default to stage one. The server serializes updates to a member's setup row, rejects stale revisions and saves each stage along with its cursor change. New social profiles start private, with discovery and auto-sharing off. Existing privacy choices stay in place for members who predate the rollout. Returning members can fill in missing details from Settings.

## Review and rollout sequence

1. Review the draft against the current main branch. Batch 88 also changes the app entry point and native asset allowlist. Keep both sets of assets and the separate workout-revision and profile triggers when resolving those branches.
2. Run the onboarding migration and tests on an isolated production-shaped fixture. The targeted Running staging project lacks the social profile schema. A hosted onboarding exercise requires a separate approved environment with the social, invitation, Storage and Garmin dependencies.
3. Verify registration, account switching, privacy enforcement and actual Garmin OAuth with synthetic hosted accounts. Review the existing registration Terms and Privacy Policy links and confirm any separate Disclaimer acceptance gate with the owner. This batch preserves the existing registration acceptance copy.
4. After explicit release and merge approval, apply the migration before serving the updated app. The login membership query requires the new onboarding column. Verify a new member and an existing member after rollout and confirm auto-sharing remains off for newly onboarded accounts.

The browser regression attaches five stage screenshots and the updated private and social profile settings. Browser response fixtures exercise the real app interface. The isolated PostgreSQL suite covers actual database authorization and persistence.
