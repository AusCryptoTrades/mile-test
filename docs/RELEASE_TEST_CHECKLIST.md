# MILE release gate and real-device checklist

## Automated checks (required before requesting iPhone testing)
- [ ] GitHub Actions run completed successfully on the exact candidate commit (desktop Chromium, mobile Chromium, mobile WebKit)
- [ ] Tests exercise real application UI, not just synthetic overlays, for each claimed fix
- [ ] Activity Details Back control is visible, receives clicks and closes the actual overlay
- [ ] Header height is reasonable at iPhone viewport widths
- [ ] Heart-rate and pace plots and their labels stay inside the viewport
- [ ] PNG export flow verified in browsers that support it
- [ ] Garmin splits parser covered with sanitized actual-shaped lap payloads and a missing-laps case
- [ ] Previously fixed calendar selection and Social Feed distance have regression coverage
- [ ] No unexpected JavaScript page errors in covered flows
- [ ] Screenshots, trace links and test results recorded in the pull request

## Real iPhone checklist (send to user only after verified automated gates)
- [ ] Open a real Garmin activity, tap Activity Details, confirm Back is visible and closes the view
- [ ] Confirm black header is not oversized and heart-rate/pace labels are fully readable
- [ ] Export an activity image in iPhone Safari; verify preview, long-press or Share, and image saved to Photos
- [ ] Compare kilometre splits with the same activity in Garmin Connect
- [ ] Confirm calendar date selection and Social Feed distance remain correct

## Safe repair-loop policy
- Work only on a feature/fix branch; do not auto-merge to main
- Limit automated repair attempts to **three** per failing issue
- Each attempt must preserve the original failure evidence and rerun tests
- Stop if tests cannot authenticate, Garmin payloads are unavailable, secrets are requested, or failures are not reproducible
- Notify user only when candidate is genuinely ready for device testing, or when a blocker needs a decision
- A green fixture-only smoke suite is **not** sufficient to label a release ready
- Do not silently deploy or claim success from pending/in-progress runs

## Report format
Version/commit:
Branch/PR:
Completed automated checks:
Unverified flows and why:
Remaining iPhone checks:
Decision: READY FOR PHONE TEST / BLOCKED / TESTS FAILED

See [Browser repair setup](BROWSER_REPAIR.md) for the GitHub workflow, the three-attempt limit and the remaining manual controls.
