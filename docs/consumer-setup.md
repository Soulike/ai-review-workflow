# Set up AI reviews

Connect your repository to the reusable workflow to receive pull-request
comments and a review gate. The workflow runs Copilot CLI on GitHub-hosted Linux
runners on GitHub.com. Consumers do not install pnpm, implementation scripts,
or a gh-aw compiler. GitHub Enterprise Server and alternative provider
credentials are outside this interface.

## Prerequisites

- You need permission to configure Actions, secrets, and branch rules. Your
  repository and organization policies must allow the actions and reusable
  workflows used by `Soulike/ai-review-workflow`, including the token permissions
  listed under [calling the workflow](#call-the-reusable-workflow).
- Establish Copilot CLI access through the built-in `GITHUB_TOKEN` and
  `copilot-requests: write`. This permission alone does not grant entitlement or
  billing access. Follow [GitHub's prerequisites](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions),
  including the policy for organization-billed CLI use. A personal subscription
  alone does not establish access for this workflow's token.
- Store a Tavily API key in an Actions secret available to your repository.
  Tavily provides external-source search and extraction. The secret's name in
  your repository is your choice; pass it to the workflow as `TAVILY_API_KEY`.

The public interface accepts only the Tavily secret. GitHub supplies the
built-in token; do not pass a PAT, `COPILOT_GITHUB_TOKEN`, or `GH_AW_*` token
override. Use explicit secret mapping, not `secrets: inherit`.

Your repository's PR-admission settings remain yours. The workflow repository's
collaborator-only policy is not a consumer prerequisite; gh-aw's own actor
authorization still applies.

## Call the reusable workflow

Call `Soulike/ai-review-workflow/.github/workflows/ai-review.yml@main` from a
job's `uses`, not from a step. You can add that job to an existing workflow or
create a workflow under `.github/workflows/`. Choose a caller filename such as
`review-pr.yml` or `ai-review.yml`. The filename `review.lock.yml` is temporarily
unsupported: the pinned gh-aw runtime mistakes that caller for the shared engine
and fails activation ([compatibility issue #12](https://github.com/Soulike/ai-review-workflow/issues/12)).
The workflow name and job name are your choices. See
[GitHub's reusable-workflow syntax](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
for how the calling job fits into a workflow.

The integration must satisfy these requirements:

- Invoke it only for `pull_request_target` events. Other event types fail setup.
  If your workflow also handles other events, restrict the calling job with an
  `if` condition.
- Grant the complete permission set shown in the example's calling job. The
  [public workflow](../.github/workflows/ai-review.yml) requests these permissions;
  a reusable workflow cannot increase its caller's permissions. Read access
  supports review evidence, `copilot-requests: write` permits inference, and
  `pull-requests: write` permits comment reviews. The shared workflow narrows
  permissions per job; the reviewer uses read-only GitHub tools. See
  [GitHub's permissions reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).
- Pass a supported `reasoning-effort` input and map your Tavily secret to
  `TAVILY_API_KEY`. Other inputs are optional; see
  [review configuration](#configure-the-review).
- Invoke it once per caller workflow run. Repeated or matrix calls can collide
  on framework artifact names.

For the usual PR lifecycle, subscribe to `opened`, `reopened`, `synchronize`,
and `ready_for_review`. Include `converted_to_draft` with per-PR concurrency
cancellation to stop an active review when a PR becomes a draft. These are
caller-owned scheduling choices: changing event or branch filters changes which
PRs receive reviews and gate checks.

### Example

This complete example uses shared review criteria, the default model and network
access, and a literal reasoning effort. Adapt the names and settings to your
repository while preserving the integration requirements above.

```yaml
name: Review pull request

on:
  pull_request_target:
    types: [opened, reopened, ready_for_review, synchronize, converted_to_draft]

permissions: {}

jobs:
  review:
    name: Review
    concurrency:
      group: ${{ github.workflow }}-ai-review-pr-${{ github.event.pull_request.number }}
      cancel-in-progress: true
    permissions:
      actions: read
      checks: read
      contents: read
      discussions: read
      issues: read
      pull-requests: write
      security-events: read
      statuses: read
      vulnerability-alerts: read
      copilot-requests: write
    uses: Soulike/ai-review-workflow/.github/workflows/ai-review.yml@main
    with:
      reasoning-effort: high
    secrets:
      TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
```

Here, `secrets.TAVILY_API_KEY` is the repository secret selected for the example;
the key on the left is the required workflow secret name. Job-level concurrency
cancels superseded review calls without cancelling unrelated jobs in the same
workflow. Choose a group that does not collide with other work in your
repository; the shared workflow does not manage per-PR cancellation for you.

## Configure the review

Pass settings through the calling job's `with` mapping. Repository variables
are optional: a value can be a literal, such as `reasoning-effort: high`, or an
expression, such as `reasoning-effort: ${{ vars.REVIEW_EFFORT }}`. If you choose
variables, create them under Settings → Secrets and variables → Actions →
Variables. Their names are yours; the input names below are fixed. An unset
variable does not supply a valid required reasoning effort.

| Input                | Contract                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reasoning-effort`   | Required: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Empty, whitespace-padded, and unsupported values fail before inference. The selected model must also support the effort.                                                     |
| `model`              | Optional; defaults to `auto`. Passed to Copilot; support and access depend on the runtime and account. Copilot and gh-aw may resolve an identifier to a different model.                                                                              |
| `review-prompt-path` | Optional repository-root-relative `.md` or `.markdown` path. Empty means shared criteria only. The file must be readable and resolve within the repository; absolute paths, directories, and paths or symlinks that escape the repository fail setup. |
| `network_allowed`    | Optional comma-separated domains or gh-aw ecosystem identifiers. Empty keeps the default allowlist; entries add to it. See [extra network access](#extra-network-access).                                                                             |

### Repository review criteria

To extend shared criteria, commit a Markdown prompt such as
`docs/review-criteria.md` and pass its path as `review-prompt-path`. Describe
project-specific responsibilities, conventions, and evidence. Do not repeat the
output format or ask the reviewer to run candidate tests, modify code, or merge.

Applicable instructions and the prompt come from the exact PR event's **base**
commit, not the proposed head. Land a new prompt before enabling its path; a
prompt first added in a PR cannot judge that same PR. Shared review Skills and
reference material follow their latest upstream versions.

The shared [review instructions](../.github/workflows/review.md#review-body) lead
with the AI review's conclusion, followed by a brief explanation and visible
model, commit, and severity details. Summaries use the main language of the PR
description, with English as the fallback; wording varies with the change.

### Extra network access

The default sandbox allowlist includes Tavily (`mcp.tavily.com`) and gh-aw's
`github` domain group, including GitHub documentation and raw file hosts. Pass
`network_allowed` to add other sources. For example,
`node,python,docs.example.com` adds the Node and Python ecosystems plus a
project-specific documentation host.

Entries are comma-separated; domains also allow their subdomains. Additions are
combined with the defaults, not substituted for them. Use trusted caller
configuration or repository variables, not PR-provided content. This input
extends sandbox network access; it does not provide credentials or change GitHub
permissions. See gh-aw's [network reference](https://github.github.com/gh-aw/reference/network/#caller-extensible-allowlist-networkallowed-input)
for supported ecosystem identifiers and domain syntax.

## Verify and require the gate

After the caller and any configured prompt reach your default branch, trigger
a new supported event on a ready PR. The introducing PR cannot verify a newly
deployed `pull_request_target` workflow. Before making the gate required:

1. Open the run in Actions and confirm setup, inference, and publication succeed
   in your repository. This checks your actual credentials, model access, and
   organization policies; this repository's self-review does not verify yours.
2. Confirm a `github-actions[bot]` comment review identifies the reviewed head
   and model. With successful execution and publication, an `approved` verdict
   passes the gate; `needs-change` fails it. High or medium findings require
   changes. The gate reads a structured result, not the review's Markdown.
3. Select the check name GitHub actually emits in your branch's required-check
   settings. With the example's job name, expect
   `Review / Engine / AI review gate`; renaming the calling job changes the
   prefix. Bind the required check to GitHub Actions where supported.

Keep human merge control and ordinary candidate CI. The workflow publishes
`COMMENT` reviews, not GitHub approvals or `REQUEST_CHANGES` reviews. A passing
review gate is not permission to merge, and the reviewer does not replace your
test workflow.

## Drafts, changes, and recovery

Drafts do not run inference or publish a verdict; their gate cannot pass.
With the lifecycle events and cancellation in the example, marking a PR ready
starts a review, a new head replaces older work, and conversion to draft cancels
an active review.

Each run reviews its event's fixed change independently. Publication does not
recheck the PR's current open/draft/base/head state. To review a different head,
trigger a new supported PR event rather than rerunning the old event.

- **A completed review needs changes:** address or discuss the findings.
  Re-running only the gate cannot change a `needs-change` verdict.
- **Setup, inference, or publication failed:** inspect the failed job's log,
  correct the cause, and choose **Re-run failed jobs**. Successful stages can be
  reused. If required evidence is inaccessible, the review cannot complete;
  do not supply a broader token to work around the public interface.
- **A required artifact expired, was deleted, or conflicts on rerun:** choose
  **Re-run all jobs**. The verdict artifact is retained for **30 days**; other
  artifacts follow gh-aw and repository retention settings.

Re-running only the gate reads the existing result and does not publish again.
Re-running publication may leave another visible review; there is no comment
deduplication or cleanup. Failed prerequisites or a missing or invalid structured
result cannot pass the gate.

Consumers follow `main`, with no release or version-bump process. If an upstream
change breaks reviews, report the run URL and workflow implementation SHA.
Follow your administrator's recovery procedure; do not manufacture a passing
review result.
