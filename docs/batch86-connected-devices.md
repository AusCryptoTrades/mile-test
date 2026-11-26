# Batch 86.5 — Connected devices UI contract
Status: design only. No live connection or upload implied.
Settings > Connections > Connected devices
- Garmin: retain existing connect, status, last sync, reconnect and disconnect controls and backend.
- Apple Health: iOS native only; web/Android explain availability without presenting a working connect button. On native iOS, check HealthKit availability, show explicit read permission rationale and request access only on athlete action. Authorization request completion does not prove read permissions. Show "Permission request completed" rather than "Connected" until an authorized device import has been verified. Historical date range chooser, progress, cancellation, last successful sync, retry and local disconnect controls are gated until authenticated ingestion and deletion behavior are implemented. Explain revocation in Apple Health Settings; do not claim the app revokes system permissions.
- COROS: Coming soon; no OAuth button before provider approval and implementation.
- Compact theme-aware cards, single primary action per provider, wrapping status/secondary controls, no horizontal overflow. Retain all existing Garmin actions and avoid changing production.
- Duplicate candidates: present source badges and reviewable links; retain original records and distinguish actual completed sync from no data or permission unavailable.
- Never display or log health payloads, tokens or opaque cursors in this view.
Acceptance: browser responsive layout on all seven themes, native availability and permission state mocks, physical iPhone review, account switch isolation, explicit consent, no background sync before opt-in and verification.
