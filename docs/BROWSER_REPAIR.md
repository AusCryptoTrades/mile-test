# MILE browser repair

MILE browser tests run on GitHub-hosted Ubuntu for desktop Chromium, mobile Chromium and mobile WebKit. The existing workflow name and artifact names are retained for MILE Release Watch. The repair workflow writes Actions summaries and opens draft repair PRs without sending a separate alert. Release Watch's external configuration needs verification by its owner.

## Enable after review

1. Review the workflow PR and use your normal merge process. GitHub only receives the completion trigger for the repair workflow once its definition is on the default branch.
2. Create a GitHub Actions environment named `mile-browser-repair`. Restrict it to the default branch. Store an OpenAI project API key with an appropriate budget as the environment secret `MILE_REPAIR_OPENAI_API_KEY`. Configure environment approval if you want a reviewer to release the secret before each attempt. Keep MILE, Garmin and Supabase credentials out of CI.
3. Enable GitHub Actions to create pull requests if repository policy allows it. The repair job uses the repository's ephemeral `GITHUB_TOKEN`. The model never receives a repository write token.
4. Set the repository variable `MILE_ENABLE_BROWSER_REPAIR` to `true`. Use `fix/mile-<GitHub issue number>` for approved tasks eligible for repair. Use the same issue number for all attempts addressing that issue. Limit write access to these branches to trusted contributors. Set the variable to `false` to pause new repairs.

## What happens on a failure

An eligible same-repository push must fail the actual browser-test step, still be the branch tip, and reproduce on a fresh runner before a repair slot is reserved. Runner and dependency setup failures remain in the original CI report. The workflow saves the reproduction evidence without giving the test runner an OpenAI key.

Each reproducible completion can consume one of three durable slots for its issue. The slot is reserved atomically before Codex starts using the tag `mile-repair/<issue>/<attempt>`. Failed and cancelled attempts keep their slot. Preserve these tags. Rerunning a repair workflow never starts Codex a second time. If another attempt is appropriate, rerun the original browser workflow on the current branch tip or push a new candidate for the same issue. A fourth attempt stops at the reservation gate. Review infrastructure errors, ambiguous failures, missing live Garmin data and unavailable authentication manually.

The OpenAI Codex Action receives the application file, test source and a bounded excerpt from the synthetic reproduction. It can propose changes to `index.html`. A fresh runner with no OpenAI key runs the original suite against that file. A separate publisher can create a new repair branch and draft PR into the development branch if every test passes and the original branch still points to the tested commit. Review the diff and evidence before merging. The workflow has no merge or deployment step. If publication fails, the validated file and reports remain available in Actions artifacts.

Run summaries link the original failure, reproduction and validation. Reports retain synthetic screenshots and traces for seven days. Never run the fixture suite with a private account or upload private activity payloads.

## Codex Cloud and GitHub Actions

The Codex CLI exposes the experimental `codex cloud exec --env … --branch …` command for starting a Cloud task. Its Cloud backend uses Codex account authentication. A supported unattended GitHub Actions credential for the MILE Cloud environment was not verified. This workflow uses the official OpenAI Codex Action with an environment-scoped API key and executes on GitHub-hosted runners. It does not create a Codex Cloud task.

- [Official Codex GitHub Action](https://github.com/openai/codex-action)
- [Codex CLI Cloud task implementation](https://github.com/openai/codex/tree/main/codex-rs/cloud-tasks)
