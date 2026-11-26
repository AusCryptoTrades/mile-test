# Controlled Garmin delivery test — Batch 87

No live write authorized by this development commit.

1. On an isolated preview, authenticate as the affected athlete. Use mile-garmin-diagnostic.html to read the existing workout and exact schedule IDs and original date from the prior audit. The current production diagnostic endpoint only reads Garmin records for this action; its normal token-refresh path may update the stored OAuth connection.
2. If readback is successful, compare the Garmin Connect web calendar and watch training calendar; a historical entry may no longer be visible. Record HTTP/status outcomes without copying tokens or full identity details.
3. If all API results are coherent but Connect is missing the event, request a Garmin partner trace for the existing IDs. Ask about environment, app activation, consumer calendar and device delivery. Do not assume a new API tier fixes it.
4. Before a new write, complete the authenticated server adapter, persistent registry, account identity and explicit consent checks, and prove the registry in staging. Use one future dated, uniquely named, simple running workout; preview its exact steps and date, obtain explicit approval, create and schedule once, read back both records. Do not retry ambiguous outcomes; reconcile first.
5. Confirm calendar visibility in Garmin Connect and normal device sync on the athlete's watch before marking delivery confirmed. Never infer device delivery from API success.

New running generation: easy sessions select 10 min from the old 5–10 min warm-up range; threshold cooldown selects 1.5 km from 1.5–2 km; stride recovery and speed drills use manual lap completion because old prescriptions did not specify exact duration. Main interval counts, between-rep recoveries and pace ranges are preserved. Long-run warm-up is included within its planned distance; pace remains guidance rather than a device alert for that session. These are intentional explicit defaults visible in the written plan, not silent conversion of legacy workouts. Edited text requires review. No existing planned workouts are rewritten.
