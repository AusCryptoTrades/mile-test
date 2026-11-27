# Batch 87.7 — Profile, navigation and visual consistency
Based on physical iPhone feedback following PR 133.

- Profile editor: organized photos, personal details, disciplines and privacy; compact theme-aware checkbox/switch controls and labeled reorder buttons alongside the existing drag behavior. Preserve existing field IDs, data types, privacy choices and server save contract. Protect in-progress edits during Social background refresh. No new public profile fields or backend schema changes.
- Social: Back and notification bell on one row, redundant hamburger removed; contextual back actions preserved for deeper pages; Challenges bridges to the parent Social menu/notifications. Compact feed filters and on-demand privacy notice; compact populated Following rows with message and connection actions. 
- Main app uses existing 86px banner; embedded Tracker, SIM and Challenges adopt equivalent sizing, typography, mountain artwork and alignment. Preserve live exercise controls and bottom nav.
- Native details expand with plus/minus; actual selects and navigation retain their appropriate semantics. Interval and request segments have lighter selection styling. PWA top safe-area mask is subject to physical iPhone verification.
- No new location, club or training goals fields, photo deletion or privacy default changes in this UI release; separate data/privacy review required before adding fields or altering auto-share defaults.
- Tests added for actual profile save payload with synthetic data, in-progress changes, populated followers, compact feed and notification/back behavior, banner geometry and screenshots.

Release gates: all browser projects and layout/native/Garmin/admin checks pass at final head; inspect populated profile and privacy, feed, follow requests, banner screenshots; resolve remaining visual defects and verify deployment. Physical device acceptance remains separate from browser emulation.
