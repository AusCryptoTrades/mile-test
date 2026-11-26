# Batch 86.4 — Universal sync engine acceptance contract
Status: design only. HealthKit read-only bridge compiled in unsigned simulator CI; no device authorization or actual health records verified.
- Extend bridge with explicit date intervals and anchored incremental queries before exposing historical import. Current recent-only prototype must not be represented as full history. Handle truncation by paging or subdividing time intervals, with no gaps at boundaries; same-timestamp records must not be lost.
- Use provider adapters, stable per-account source record identity, normalized UTC timestamps, explicit duration seconds and optional distance metres. Missing values remain null, not zero.
- Preserve original provider source and distinguish manual, Apple Health and Garmin records. Use conservative, reversible cross-provider duplicate reconciliation; never silently delete original records.
- Authenticate every cloud ingestion request, derive athlete ID server-side, enforce ownership and idempotency, restrict data to explicitly opted-in categories. No health payload logging. Do not store raw data unnecessarily.
- A sync checkpoint advances only after confirmed durable ingestion. Retries must not duplicate workouts; interruptions must resume from last committed checkpoint.
- Test empty results, unavailable permission, duplicate/replayed data, missing metrics, invalid timestamps, unit conversions, overlapping date intervals, truncation and failed writes. Real device and signed entitlement testing required before rollout.
- Preserve Garmin behavior and existing live release. No backend migrations or production changes until the contract and privacy review are approved.
