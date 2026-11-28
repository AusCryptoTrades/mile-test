# Integration plan for PRs #141 and #140

A three-way dry run from the shared main base `9b6ec74` found five conflicts against Running Build head `728bdd1`. Reconcile on a new integration branch after the owner approves the sequencing. Keep the two review branches independent.

| Conflict | Resolution |
| --- | --- |
| `MILE-DESIGN.md` | Keep the shared foundations and editor rules from #141. Incorporate #140's onboarding, prescription and evidence display rules. |
| `index.html` | Use #140's event wiring, authentication, onboarding, Running Build, Calendar revisions and structured Tracker handoff as the behavioural base. Apply #141's CSS imports, active navigation, menu scroll handling, training form markup, validation and date presentation in the corresponding handlers. Check for duplicate imports, handlers and dialog definitions after resolving. |
| `mile-challenges.html` | Keep #140's avatar loading, shared header and embedded bridge. Carry over #141's shared stylesheet and date rendering. Verify both direct entry and embedded return. |
| `mile-run-tracker.html` | Preserve #140's canonical workout expansion, step timing, target rendering and recovery behaviour. Retain #141's typography and compact stylesheet imports. Verify both structured and legacy sessions. |
| `native/scripts/stage.mjs` | Take the union of reachable assets, including #141's stylesheet, #140's modules and both required standalone dependencies. Verify staged references and manifest hashes. |

On the integration branch, run the full Chromium and WebKit matrix, both sets of targeted Running Build and onboarding tests and the native bundle check. Check Calendar-to-Tracker handoff, session save with the keyboard showing, existing-athlete entry and private profile photos in staging with synthetic accounts. Verify the staged Garmin contract separately. Record results against the exact integration commit, then request a review of the resolved files and the owner’s production decision.
