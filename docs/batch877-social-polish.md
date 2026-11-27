# Batch 87.7 — Profile, navigation and visual consistency
Based on physical iPhone feedback following PR 133.

- Profile editor: organized photos, personal details, disciplines and privacy; compact theme-aware checkbox/switch controls and labeled reorder buttons alongside the existing drag behavior. Preserve existing field IDs, data types, privacy choices and server save contract. Protect in-progress edits during Social background refresh. No new public profile fields or backend schema changes.
- Social: Back and notification bell on one row, redundant hamburger removed; contextual back actions preserved for deeper pages; Challenges bridges to the parent Social menu/notifications. Compact feed filters and on-demand privacy notice; compact populated Following rows with message and connection actions. 
- Main app uses existing 86px banner; embedded Tracker, SIM and Challenges adopt equivalent sizing, typography, mountain artwork and alignment. Preserve live exercise controls and bottom nav.
- Native details expand with plus/minus; actual selects and navigation retain their appropriate semantics. Interval and request segments have lighter selection styling. PWA top safe-area mask is subject to physical iPhone verification.
- No new location, club or training goals fields, photo deletion or privacy default changes in this UI release; separate data/privacy review required before adding fields or altering auto-share defaults.
- Tests added for actual profile save payload with synthetic data, in-progress changes, populated followers, compact feed and notification/back behavior, banner geometry and screenshots.

Release gates: all browser projects and layout/native/Garmin/admin checks pass at final head; inspect populated profile and privacy, feed, follow requests, banner screenshots; resolve remaining visual defects and verify deployment. Physical device acceptance remains separate from browser emulation.

## 87.7.2 — follow-up density and navigation
- Tracker setup Back below banner; return to the originating main route (Social returns to feed), standalone fallback Home. Hide during active/paused/finished runs, disable while acquiring GPS; preserve finish-to-Track flow.
- SIM setup banner above its existing Back control. Hide the setup banner during live/review/results, retain leave confirmation.
- Flatten request tabs and feed filters, reduce Post Activity form spacing and checkbox sizes, compact notification toolbar and move its informational text behind an info disclosure. Keep all existing actions and privacy options.
- Keep setup controls at least 44px, input font 16px for iOS, Begin Run at least 48px; no change to live metrics, recording or session progression.
- Additional browser tests cover Back destinations, in-run guards, SIM leave confirmation, Social tabs and form controls. All final-head checks and new screenshots must be reviewed before merge.
