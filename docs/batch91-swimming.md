# Batch 91 Swimming Stage 1

Draft is stacked on Cycling PR #143 at `af2b9c333fbc4052acde56b11d5eabb86477af92`. Keep the swimming draft isolated while the release branches are under review.

## Implemented

- Five-stage Build for goal, swim fitness, schedule, preferences and explicit programme review before Calendar creation. Shared athlete experience, sporting interests and priorities provide initial suggestions. Swim-specific measurements and approved trial inputs live in the athlete's private training document.
- Historical 7, 28, 90 and 180 day recorded distance and longest sessions cover completed days. Displayed history may be partial. Athletes confirm sustainable volume, longest recent session and continuous swim ability before generation.
- 53 pool recipes with session purpose and focus. The compiler uses whole lengths in 25 m, 50 m and 25 yd pools and adds real wall rest between repeats. Pace guidance uses seconds per 100 m, even when pool distances are stored internally as converted metres. Distance totals exclude wall time; duration estimates include it. Unknown or very limited beginner ability uses short timed efforts in supervised standing depth. Open-water and triathlon goals use pool rehearsal.
- Shared structured workout validation uses `{sport:'Swimming'}` and the new `swim_pace` target. Build and Calendar render the same saved steps. Each session has a stable ID, date, revision and distinct prescribed distance and estimated time. Retain manual workout edits and historical sessions.

## Evidence and model

Critical speed is the slope of the distance–time relationship. From 200 m and 400 m tests, the slope is `200 / (t400 - t200)` metres per second, so seconds per 100 m equals `(t400 - t200) / 2`. The two-point protocol is repeatable in trained swimmers under standardised conditions. Two short efforts limit model validity and provide especially weak data for estimating work above critical speed. Pool length, turns, pacing, fatigue, stroke and test protocol can change the result. Staff or a coach should supervise tests. Use comparable recent measured freestyle efforts in the same metric pool, with adequate recovery or separate days. Uncertain and new swimmers can leave CSS blank. [Critical speed protocol and limits](https://pmc.ncbi.nlm.nih.gov/articles/PMC10875687/)

Eight-week expiry, trial plausibility bounds, eligibility requiring 400 m comfortable continuous swimming, pace offsets, progression ceilings of 4%, 6% and 7%, deloads, taper, duration allowance and race preparation warnings are Stage 1 coaching heuristics. They require independent swim-coaching review before release. A reported easy pace affects estimates only. Unknown recovery or competing demanding commitments suppress progression. Equipment is optional and the generator leaves absent gear out of the prescription. Assess open-water location, conditions, supervision and partner separately. [Open-water safety](https://rnli.org/water-safety/choose-your-activity/open-water-swimming)

The taper direction draws on evidence that reducing volume before competition can help trained swimmers. Stage 1 retains familiar short efforts without prescribing the study's loading or taper dose to recreational athletes. [Experimental swimming taper study](https://pubmed.ncbi.nlm.nih.gov/17530932/)

## Stage 2 continuation

1. Expand coach review and representative multiweek audits, including very slow pace, limited continuous ability, different strokes, pool-to-open-water transfer and sustained high-volume variety. Recheck extension blocks and how other sports affect load. Verify presentation on physical devices and run the full release suite.
2. Add private Swimming MILE IQ using recorded swim lengths, actual pool units and explicit matching evidence. Retain the exact prescription and revision with a confirmed match. Separate moving and elapsed times, actual stroke and recorded recovery. Withhold pace/length comparisons when source pool length, step alignment or reliable duration is unavailable.
3. Add swimming-specific revision validation and evidence/consent binding before offering any adjustments. Use the shared authenticated revision ledger for expected versions, immutable receipts and completed-session protection.
4. Verify the Garmin partner contract with sanitised real receipts before enabling publication. Pool course units, swim-specific targets, rest and repeat representation need their own mapper and sandbox readback. Confirm provider identity and revision before matching. Automatic changes and Garmin publication remain gated.
5. Keep all tests synthetic until a separate hosted staging review is authorised. Production and existing draft branches stay untouched.

Run targeted tests with `npm run test:e2e -- tests/batch91-swimming.spec.js tests/batch91-swimming-ui.spec.js`.

## Stage 2 implementation and verification

- Private Swimming MILE IQ shows a short summary and collapsed evidence. It uses recorded movement time where explicitly supplied, deduplicated swim distance windows and the current athlete check-in. It binds a manual link to a snapshot of the current prescription and revision. Matching claims require the athlete's confirmation, and individual-length, recovery and stroke conclusions require provenance and alignment unavailable in the existing provider feed.
- Swimming inherits the shared authenticated approval flow. The server checks the latest two fatigue ratings, membership, Calendar visibility and an eligible imminent demanding swim. It confirms supported pool units, exact whole-length steps and consistent distance and duration totals. The only policy proposes a shorter easy swim with wall rests. A stale, ambiguous, completed, matched or Garmin-claimed session is ineligible. Approval writes the same reviewed snapshot and appends an immutable receipt. Stale whole-document saves cannot undo it. The app surfaces the review and history only in the existing staging gate.
- The official Garmin FIT SDK can round-trip pool workouts for 25 m, 50 m and 25 yd up to 50 supported steps. Offline export uses measured lengths and timed wall rests. Pace carries through as notes. Automatic matching, cloud publication and republication remain disabled. Real supported-device import, watch rendering and partner API readback still require a sandbox fixture. [Garmin FIT workout guide](https://developer.garmin.com/fit/cookbook/encoding-workout-files/)
- Automated coaching checks cover 36 complete 12-week profiles plus 108 varied simulations, including pool units, duration caps, uninterrupted swimming limits, fatigue, mixed-sport scheduling and dated events. This is implementation validation. Independent swim-coaching review, real-device testing and authorised hosted migration verification remain release gates.

The next separate development priority is native Apple Health, HealthKit and Apple Watch for the runner beta.
