# Batch 87.5 FIT delivery — backend readiness

Basis: Garmin Activity API 2.1 §6.4 (owner-supplied documentation). Activity Files sends a metadata push; it includes userId, summaryId, fileType, callbackURL, activityType, startTimeInSeconds, activityId. The tokenized URL is valid for 24 hours and can only be downloaded once (410 on duplicate). Starter limit 50/min/client ID. This is distinct from ordinary Ping/Pull summaries. Existing portal previously had Activity Files disabled; current setting not verified.

This commit provides the callback validation and FIT normalization contract, including strict identity, ordered lap boundaries, complete session totals, no guessed labels and correct stationary recovery. Uses official Garmin SDK field names and expects dates and enum strings decoded by that SDK. Contract unit tests do not prove real Garmin file contents or endpoint access.

## Deployment gates (not yet deployed)
1. Separate webhook (do not change existing Garmin summary/detail/health receiver). Authenticate with existing server-side webhook secret; validate each item and look up exact connected Garmin user ID server-side. Never log callback tokens or expose them to browsers.
2. One-time download: durable receipt and per-activity claim, enforce 50/min across app, exact callback allowlist and redirect:error, bounded stream and timeout. Persist raw bytes privately before decode to allow retries without downloading again; purge raw after success and define limited failed-file retention. Do not acknowledge before durable acceptance. Protect against duplicate notifications and cross-owner writes. Handle 410 explicitly.
3. Pin official @garmin/fitsdk 21.217.0; Decoder.isFIT/checkIntegrity/read, reject decode errors. Verify decoded start against notification, summary owner/time before exposing labels. Use normalized lap JSON in separate owner-scoped storage; never overwrite JSON activity details or expose FIT raw bytes/tokens. Existing authenticated personal and shared readers must retain access checks and route redaction.
4. Test actual SDK-generated binary, corrupt CRC, duplicate callbacks, rate limiting, unauthorized and cross-owner requests, partial laps, database failure, and existing Garmin paths before deployment.
5. Enable Activity Files in developer portal only after verified receiver deployed. Real controlled MILE-planned and Garmin-created workouts must arrive with labels; existing activities without labels remain unchanged.

Official SDK: https://github.com/garmin/fit-javascript-sdk
Official activity file format: https://developer.garmin.com/fit/file-types/activity
