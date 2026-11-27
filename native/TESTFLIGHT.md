# TestFlight release preparation

Current development ID: au.com.milefitness.training.dev. Proposed production ID: au.com.milefitness.training (confirm before registering).

## Owner steps
1. Confirm Apple Developer membership and eligible account type for a fitness app handling health data.
2. Register the final explicit bundle ID in Certificates, Identifiers & Profiles.
3. Create the app in App Store Connect with the same identifier.
4. Create a distribution certificate and App Store provisioning profile.
5. Set up restricted App Store Connect API access for upload.
6. Establish a restricted GitHub release environment with required reviewers, protected main branch, and repository privacy review. Never commit or paste signing materials into chat.
7. Store signing materials only in the restricted release environment: IOS_DISTRIBUTION_P12_BASE64, IOS_DISTRIBUTION_P12_PASSWORD, IOS_PROVISIONING_PROFILE_BASE64, ASC_API_KEY_P8_BASE64, ASC_API_KEY_ID, ASC_API_ISSUER_ID, APPLE_TEAM_ID. Names are proposed, not configured.

## Release gates
- Native authentication security review and device session tests, including logout and refresh race cases.
- Verified final bundle identifier, Apple membership, signing identity and matching profile.
- Review privacy disclosures, export compliance and App Store Connect beta metadata.
- Reproducible dependency lock and unique build numbers.
- Protect signing credentials from arbitrary PR builds. Manually approved main-only release, no secrets in logs, no publicly accessible signed artifacts.
- Signed archive/export/upload workflow must be reviewed and implemented after the above requirements. The current workflow only inspects signing configuration and does not sign or upload.
- TestFlight processing and eligibility for internal testing; external beta review if applicable.

## Running the preflight
From main, manually dispatch MILE TestFlight signing preflight. It uses the existing native project generator and shows non-secret signing settings. No Apple credentials needed.
