# Batch 87: Garmin Training publishing audit and release gates

Status: isolated development; no production deployment and no live Garmin mutations.

## Findings
- Current official Garmin program describes Starter as supporting Training API publishing. Personal API is not the business workout publisher. Enterprise is not established as necessary for this use case.
- Deployed MILE garmin-workout-push version 18 uses server-side OAuth, per-user token refresh under an advisory transaction lock, the WORKOUT_IMPORT permission gate, and documented workout creation/readback and schedule creation/readback paths.
- Reference: https://github.com/roelsroels/garmin-running-workouts-import/blob/main/garminworkouts/garmin/starterclient.py uses the same official routes and authorization headers. Its migration notes explicitly distinguish synthetic/reference implementation from remaining live development-environment verification. Its default legacy provider and screenshot do not prove Starter UI visibility.
- MILE currently generates a fixed test workout rather than the selected training-plan session. Its previous successful create/read/schedule/read results do not prove Garmin Connect rendering. Existing diagnostic mode can read a known workout, exact schedule and date-range under the athlete's own session.
- Reference payload includes explicit pool-length fields, a disabled session transition flag and a repeat skip-last-rest flag; MILE's new pure compiler represents those values. These differences are not established as the cause of missing calendar entries. No speculative route, credential or provider-name change.
- Garmin support notes that third-party workout step details may not be rendered by Garmin Connect even when the calendar entry is present: https://support.garmin.com/en-US/?faq=jnm4aY5LM880wNP6LWm1n8. Verify the calendar and watch separately.
- Garmin API user IDs and workout owner IDs need not be the same namespace. Never infer wrong account from unequal raw IDs.
- The callback currently saves tokens against the MILE user but does not persist an independently verified Garmin identity. Bind a server-verified provider identity to future publication records.

## Shared coaching path
MILE Training and future MILE Coaching should persist an athlete-owned canonical session with stable session ID, revision, athlete local calendar date, sport, structured step units and explicit targets. The coach's write authority must be separately verified against the athlete relationship; the athlete's own explicit Garmin consent is mandatory. Never accept a caller-supplied target user or provider token as authorization. Use the same compiler and publisher for self-generated and assigned workouts.

Publisher design (not yet deployed):
- Private registry scoped to athlete, connected Garmin identity, stable session ID and revision; persist returned workout and schedule IDs separately.
- Durable unique publishing operation; claim once, record create/schedule outcomes, reconcile an ambiguous timeout before issuing another POST. Never assume remote exactly-once behavior.
- Preview validated workout before publication; no implicit permission from plan creation or coach assignment. Permit opt-in future rolling sync only with athlete controls.
- Distinguish compiled, queued, API-created, API-scheduled, API-readback-confirmed and athlete/device-confirmed. Do not mark watch delivered from HTTP 200.
- Update only known app-owned future sessions; delete only after separately authorized retirement; completed activities untouched.

## Next verification
1. Use the deployed diagnose_existing action from the athlete's own authenticated MILE session to read prior known workout/schedule IDs. Do not retrieve or expose tokens, and do not make another workout mutation.
2. Inspect the private Garmin Developer Portal application status, exact Training API entitlement, environment and verification flags. Ask Garmin support specifically whether Starter's current app status allows user-facing calendar/device delivery, and to trace an existing API-accepted workout/schedule.
3. Check Garmin Connect web calendar and the watch training calendar after normal sync; distinguish missing calendar entry from missing step details.
4. Only after an evidence-based discrepancy is resolved, approve a single identifiable future-date workout trial with a durable registry and verify readback plus watch UI.
5. Implement authenticated publisher and coach/athlete authorization, run synthetic and staging tests, then separately approve production release.

Sources:
- https://developer.garmin.com/gc-developer-program/overview/
- https://developerportal.garmin.com/developer-programs/connect-developer-api
- https://developer.garmin.com/gc-developer-program/enterprise/training-api/
- https://github.com/roelsroels/garmin-running-workouts-import/blob/main/docs/garmin-official-api-migration.md
- https://github.com/roelsroels/garmin-running-workouts-import/blob/main/garminworkouts/garmin/training_payload.py
