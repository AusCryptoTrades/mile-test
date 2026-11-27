# MILE development status

The combined review branch is `feature/overnight-running-onboarding`. It starts at main `9b6ec7400dc1adc58efd6d00448e7328895f3641` and incorporates drafts #137, #138 and #139. Those branches remain independent. The combined candidate adds a 27-profile week-by-week audit, athlete profile defaults and provenance, a qualified recorded heart-rate comparison and stronger Garmin replay handling. Use the candidate pull request’s Checks tab as the source of truth for the exact head.

The documented overnight audit covered 27 profiles, including four deliberately blocked cases. The representative 50 km/week athlete is scheduled for 50, 50, 50, 40 km in each four-week cycle, with shortened recovery mileage on Sunday. The first Saturday is 18.7 km at an estimated 111 minutes. There is no upward progression with the competing HYROX commitment. Independent qualified coaching and safety review is a release gate.

Staging `fnyfeelynaozxtftrrga` passed the Running database checks before and after onboarding. A hosted transaction also passed invite, disclaimer, legacy-member and Storage RLS checks. All proof rows were rolled back. The project has an empty private `mile-avatars` bucket. Use [staging and release steps](docs/overnight-release.md) before any rollout.

Hosted browser authentication, delivered confirmation mail, Storage object HTTP and cache behaviour, deployed legal source verification, and real Garmin OAuth and round-trip identity still need verification. The runner’s HTTP proxy rejected the staging and legal origins. Automatic matching, adaptation and revision republication remain disabled. No production writes or deployment were performed.
