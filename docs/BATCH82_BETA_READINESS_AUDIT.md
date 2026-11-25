# Batch 82 — pre-beta readiness audit
Baseline: main e641b5034bfc24c680aeb0388e892a4d68dc1713, after combined 79–80 release. Batch 81 compact Admin PR #100 is separate and pending. This is an audit, not approval to change unrelated product behaviour.

## Evidence and limitations
Static review: index.html (~1.03 MB, 5,406 lines, 154 style blocks, 231 literal button tags, 113 inline onclick attributes; these are source counts, not distinct runtime controls), shared button CSS, Admin module and existing Playwright tests. Main combined release passed 373 browser tests (8 skipped). Existing automated tests use fixtures; real athlete sessions, device integration, iOS native share/GPS and live authentication need separate checks. New reporting-only browser scan inventories visible controls, labels, computed geometry, colours, font sizes, headings and clipping candidates, across three browser projects. It does not click destructive actions or establish accessibility conformance. Route errors are reported, not silently treated as pass. Findings flagged by heuristics require human review; disabled buttons, icon glyphs, calendar cells and intentionally small controls are not automatically defects.

## Confirmed source findings (not all confirmed visual defects)
| ID | Priority | Source / surface | Finding and acceptance condition |
|---|---|---|---|
| 82-01 | P1 | index.html:3824 appearance | Unit/format selections explicitly say conversion of legacy screens is still in progress. Verify each distance, pace, weight, date/time, week-start and timezone consumer. Either implement consistent conversion or label unsupported scope; never change stored SI values. |
| 82-02 | P1 | index.html:1180 goals, 2086 eventPage | Training Plans has a second Planned events / Add race goal flow backed by state.goals, while Events & PBs uses mile32 events. Trace relationship and establish a single clear event source or clearly explain distinct training goals; test create/edit/delete and dashboard/calendar consistency. |
| 82-03 | P2 | index.html:2259 raceLab | SIM featured card contains hard-coded green background/accent, uppercase CTA and larger inline padding. Check computed palette in all seven themes; retain deliberate featured treatment and permanent SIM tab, align spacing/buttons and wording. |
| 82-04 | P2 | index.html:4761 addEntries | Report a Bug, Send Feedback, Admin Centre appended separately from More menu group, emoji/inline margins rather than vector rows. Standardise as support group with descriptions and admin role gate intact. |
| 82-05 | P2 | index.html:5300s about() | About page says Private beta · Settings release 77.7. Replace stale settings-specific version with one accurate app release/build identifier and current release notes. |
| 82-06 | P1 | mile-admin-centre.js load(), visibilitychange | Returning to foreground reloads overview and clears active management content/draft. Preserve active module/filter/form and stable scroll on safe refresh, clear sensitive state on session change. Batch 81 addresses focus/scroll, not this behaviour. |
| 82-07 | P2 | mile-admin-centre.js close handler | Admin close always navigates to Settings even when opened from More. Restore originating page and focus; test both entry paths. |
| 82-08 | P2 | index.html:5240 notification preference groups, 2756 notifications | Announcements added to inbox but not preference groups. Decide explicitly whether essential system notices are non-disableable or user-toggleable; state that clearly. |
| 82-09 | P2 | index.html:1477 builder | V4.6.1 WORKOUT PREVIEW badge and mixed programme/program vocabulary. Replace stale technical version with useful progress and consistent Australian English; preserve actual training inputs and preview. |
| 82-10 | P2 | index.html:1160 calendar, 2086 eventPage, 1180 goals | Some rendered dates use ISO raw storage strings while other surfaces format local dates. Verify all active paths with DD/MM/YYYY and timezone preferences. Icon-only previous/next controls need accessible names and comfortable targets. |
| 82-11 | P1 | prior Admin security review / legacy feedback REST path | New audited endpoint does not automatically cover legacy direct admin PATCH. Review RLS and old access path before closing audit; do not break existing feedback submission. Compromised-password protection setting also needs review. |
| 82-12 | P2 | index.html multiple render wrappers/styles + mile-buttons.css | Many layered legacy rules and multiple render/navigation implementations. Consolidate only after actual computed-style evidence; preserve specialised active workout controls, tabs, calendar cells and destructive action hierarchy. |

## Full surface checklist / acceptance matrix
For each surface: review content hierarchy, typography, spacing, iconography, contrast in themes, responsive sizes, labels/units/empty/loading/error states, actionable targets, focus, back/home, history, privacy and persistence; compare with actual active rendering. Never mark a route passed simply because it mounted.
- Authentication: login, registration/invite, remember email/device, reset/password recovery, onboarding/skip, validation, sign out and account switch. Real auth separate.
- Global shell: desktop/mobile toolbar, logo, avatar, notifications/badge, What's New and return context, menus and overlay scroll lock, modal close/Escape, browser back, safe areas and themes.
- Home: widget order/preferences, activity overview and training progress, sleep/HRV/RHR/VO2, targets, recovery freshness, Today's Training, event countdown, upcoming sessions, manual/no-data states.
- Calendar: month navigation, selected day, planned/imported/linked/event indicators, totals, collapse/expand, add/edit/delete/link/unlink, session purpose, start planned tracker, adjust week, priorities and overlap.
- Build: Running/HYROX/Swimming/Cycling four steps; Strength styles/equipment/experience; all fields, scheduling constraints, empty/invalid values, preview, generate/save/cancel, rationale, reduced-load and progression logic. Check labels for metres/km/hours and units.
- Training Plans: active/hidden blocks, view/edit/delete/show/remove from calendar, workout count, event linkage, clear distinction from Events & PBs.
- Stats: time/sport filters, training overview, totals, active days, charts, history, detail entry, empty/data source/deduplication.
- Activity Details: Garmin/tracker/SIM/shared, Overview/Charts/Splits, sport-specific metrics, Back, share designs, edit, no fake splits, route visibility and iOS save.
- MILE IQ: readiness baseline/freshness, metrics, range/metric tabs, load/intensity coverage, check-in, empty data and understandable guidance.
- Events & PBs: list, add/edit/remove event, result and countdown, add/remove/share PB, date formatting, dashboard/calendar linkage.
- Race Lab: Running Lab, HYROX Lab, Race Estimates, SIM feature + tab, estimate input validation, division/result interpretation, no false precision.
- Track: free/scheduled/threshold setup, GPS permission/weak fix, start/pause/resume/next/finish, structured countdown, background/recovery, owner-only save, summary/share/back, actual iPhone GPS.
- SIM: full/half/custom, volume/distance/equipment, Roxzone, active stages, undo/edit/review, pause/exit confirmation, result/share/publish, persistence, race lab back.
- Challenges: browse/filter, create form and eligibility, entry/progress, leaderboard, completed/winner/share, real backend.
- Social drawer/profile: own/other profile, cover/avatar/edit, followers/following, privacy, tabs, hidden records, back stack.
- Social Feed: sport/audience filters, refresh, post detail, options, hide/delete, comments/likes/replies, notification exact target, route and activity privacy.
- Discover: search/filter, athlete cards, profile/open/follow/unfollow and no-match states.
- Requests: Received/Sent, accept/decline/cancel, status and counts.
- Post Activity: existing/manual activity, preview, units, optional photo/route, visibility, confirmation, no auto-share.
- Messages: inbox/thread, send/edit/delete/hide, privacy, navigation, keyboard, empty and failed send.
- Weekly Leaderboard: scopes, Melbourne week, sport scores, server-only results, error/no rank.
- Notifications: read/unread, dismiss/clear, deep-link types, preferences, announcement behaviour.
- Settings: hub; Appearance (7 themes); Units & formats; Dashboard widgets; Athlete profile; Training zones; Training preferences; Connected devices; Privacy & social; Notifications; Account & security; Data management; About; sign out. Test persistence and real owner boundaries.
- Support: Report a Bug, Send Feedback, screenshot optional, success/error, close and return; What's New; Admin role gated.
- Admin: overview, athlete management, feedback, usage, integration health, drafts/releases, security/audit; filters/pagination, loading/denial, state restoration, genuine live counts, draft-only manual verification.
- Cross-cutting: duplicate IDs/handlers, button roles and labels, destructive confirmation, disabled/pending feedback, consistent Australian English, theme tokens, no overflow, scroll stability, route restoration, timezones/units, real error states, storage/account isolation, performance and security.

## Existing test gaps / next steps
Existing suite covers selected behaviours across most pages; not proof every button or all populated states. New audit scan produces JSON per project and logs candidate findings, not a final pass. Review logs, screenshots and source; prioritise P0 security/data loss/broken paths, P1 functional/data inconsistencies, P2 visual/wording/accessibility. Verify Batch 81 after merge and re-run any affected audit. No public beta until blockers and real-device/live-account checks resolved. Split fixes by dependency, use dedicated branches and tests, provide visual proofs for material layout changes, preserve approved Home/Profile/Feed design unless defect identified.
