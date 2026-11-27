## Batch 87.5.2
Audit of main and embedded views: compact Back navigation in personal/shared activity details, workout details, settings, social, admin, Build, tracker, SIM and challenges. Shared read-only metric families use smaller padding, gap and numeric sizes; retain theme tokens and 44px coarse-pointer navigation. Do not compress live timer or workout controls. Calendar legacy polish must not insert headings while an embedded view is mounted. Tests cover Calendar launch/remount/return and interval metrics. Visual coverage across every page on physical devices remains to be verified; no backend or programming changes.


## Batch 87.6 — universal UI density and visual consistency
Combined with 87.5.2 in PR 133 to avoid releasing a partially tested dependency.
Scope: shared banner intrinsic sizing (86px minimum vs 116px fixed), compact spacing tokens, explicit menu rows, sport selection, workout previews, activity lists, recovery and stats spacing, profile cover, settings, feedback, and standalone setup/results panels. Existing theme variables, links, route handlers, bottom nav, scroll lock and workout live controls remain unchanged. Maintain 44px coarse-pointer minimum for ordinary interactive controls and existing larger exercise controls. Keep safe-area insets, full-screen maps, share-image canvas and chart data unchanged.

Regression findings from browser run 45924886558: shared action style requires 9px radius, activity Back cascade returned 13px rather than requested 12px, and the Calendar test used an inaccessible exact name rather than the existing data-mile-page control. Applied targeted fixes; still require new CI results.

Visual acceptance checklist (not yet passed):
- [ ] All browser projects pass; layout, native staging, Garmin and admin contracts pass on final head.
- [ ] Compare before/after Calendar header screenshots; inspect rendered screenshots for main routes, social routes, settings, exercise setup and activity tabs, auth and feedback dialogs.
- [ ] Verify all seven themes; check narrow phones, desktop, text wrapping, contrast, no clipping/overlap, menu scroll and return navigation.
- [ ] Inspect remaining admin submodules, populated and empty states, each sport and activity type, shared details, add/edit forms and physical-device layouts. Do not claim complete visual coverage until inspected.
- [ ] Merge only after checks and visual acceptance; verify deployed CSS and Calendar-to-Tracker behavior on production.
