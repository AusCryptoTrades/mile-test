# Batch 86 — device integration architecture (proposal, not live)
## Release isolation
Batch 85 remains frozen on its own branch. This branch is based on its tested commit; do not merge to main before Batch 85 deployment. No production schema, secrets, or provider settings changed.
## Common ingestion contract
Use a provider adapter for Garmin, Apple Health and COROS. Normalize activity identifiers, sport, UTC start/end, duration seconds, distance metres, source and original units; keep optional HR, splits, cadence, elevation and recovery observations nullable. Preserve source provenance and timezone; never substitute missing values with zero. Use user-scoped provider IDs and idempotent upserts, retain source-specific cursors, reconcile cross-provider duplicates conservatively with reversible links rather than deleting raw records. Existing Garmin ingestion must remain unchanged until contract tests establish parity.
## Apple Health
Native iOS HealthKit capability, explicit per-type read authorization, purpose descriptions and privacy disclosure. Read-only first: workouts, distance, duration, heart rate, resting HR, HRV (SDNN, not interchangeable with RMSSD), sleep and VO2 max where present. Native anchored queries and observer/background delivery where permitted; foreground/manual sync fallback. Do not infer permission denial from empty data. Upload only opted-in fields over authenticated HTTPS; server derives user identity from validated session; per-user RLS; deletion and disconnect controls. No advertising or sale of HealthKit data. Verify Apple developer terms and cloud storage restrictions before implementation. Real iPhone/TestFlight required for acceptance. Do not claim browser HealthKit access.
## COROS
Preferred Partner API for automatic sync, webhook notifications, activity files and later workout export; requires provider approval. Official self-service MCP OAuth option is a separate limited path, not a replacement for automated activity sync. Evaluate its terms and data formats before use. Server-side OAuth state binding, callback validation, encrypted/restricted token storage, refresh/revoke handling, signature verification per official docs, replay protection, idempotent event processing and reconciliation. Do not invent provider scopes, endpoints or signing algorithms. Request partner approval before live implementation.
## Acceptance gates
Unit tests for unit conversion, nullable data, timezone, dedupe and replay; synthetic provider fixtures, ownership isolation, revoke and deletion, existing Garmin regression; native device verification for Apple and real authorized COROS account for partner integration. Provider availability and permissions must be accurately represented in UI.
## Official references
https://developer.apple.com/documentation/healthkit/setting-up-healthkit
https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data
https://developer.apple.com/documentation/healthkit/protecting-user-privacy
https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access
https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP
https://github.com/coroslab/coros-open-api
