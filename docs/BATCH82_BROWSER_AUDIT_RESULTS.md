# Batch 82 browser audit — verified results, 25 Nov 2026

Baseline commit 17b7fbbbe6464932fd0d0db98b2e4f4e6debc40e on audit branch. Run 45549315055: 388 passed, 8 skipped, 10.7 min. Extracted 369 MILE_AUDIT reports and zero MILE_AUDIT_ROUTE_ERROR lines from completed job log. No measured document/root horizontal overflow on scanned states. This is a reporting-only fixture scan, not proof of all action paths or real-account/device behavior.

## Findings and dispositions
- Sign-in: explicit Email, Password, Invitation code field labels; increase clickable remember-email row (82.3).
- Home: inspect compact workout-details and training distribution disclosure. Preserve current approved Home design; no blanket resizing.
- Calendar: accessible previous/next month labels (82.1); comfortable month controls (82.3). Check calendar data and date/time consumers separately.
- Stats: small period/sport filters (82.3), keep intentional responsive scroll/wrap. Review unit conversions separately.
- MILE IQ: undersized tab/disclosure controls (82.3); review remaining range, chart and readiness labels.
- Build: tiny native day checkboxes sit inside already-clickable labels (not an automatic failure); improve label hit areas and expandable session rows (82.3). Review week/date ordering and prescription equivalence.
- Race Lab: explicitly associate every calculator label, including eight station times (82.3); themed SIM feature (82.1). Validate inputs and calculation accuracy separately.
- Settings: training-preferences day inputs are intentionally visually hidden, with clickable day tiles; enlarge actual tiles, not hidden inputs (82.3). Privacy scan was in loading/empty fixture state; existing dedicated privacy tests remain.
- More/Social: close controls and Social Hub button targets improved (82.3); support rows matched (82.1).
- Social: icon-like controls, likes/comments, activity options and profile discipline controls require review of actual hit areas; preserve approved compact social design and avoid making decorative glyphs large. Profile photo file input is intentionally hidden behind a visible labelled chooser; measure chooser, not hidden input.
- Leaderboard: previous/next week controls improved (82.3); review explanatory disclosure.
- Activity Details: no size/label flags for scanned overview/charts/splits; still verify iOS share and representative Garmin data.
- Track: associate workout selector with label (82.3), preserve 48px active controls.
- SIM: inspect actual labelled radio areas, station-volume disclosure and active/results states. Challenges: inspect filters, creation, progress and populated results.
- Admin: compact design and stable scroll in 81; draft/foreground and Back in 82.2; inspect small technical/details disclosures and all authenticated actions. Legacy report REST bypass restricted in production (82.2).
- Remaining scope: unit/timezone consistency, populated/error/empty cases not reached by scan, real account/physical device checks, security and complete integrated regression. No claim of 100% completion.

The audit did not click each button, traverse all nested states or validate every color contrast. Source counts and scan candidates must not be treated as a full accessibility certification.
