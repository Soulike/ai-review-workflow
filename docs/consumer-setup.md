# Set up Kestrel reviews

Kestrel targets GitHub.com, Copilot CLI, and GitHub-hosted Linux runners. You
need permission to configure Actions, secrets, and branch rules. GitHub Enterprise
Server and alternative provider credentials are outside this interface.

## Prerequisites

1. Enable Actions and allow the actions used by Kestrel, including reusable
   workflows from `Soulike/kestrel`. Parent policies must allow the permission
   ceiling in the caller below.
2. Establish Copilot CLI inference access using the built-in `GITHUB_TOKEN` and
   `copilot-requests: write`. YAML permission alone does not grant entitlement or
   billing access. Follow [GitHub's current prerequisites](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions).
   The documented organization path requires its policy allowing organization-billed
   CLI use. A personal subscription alone is not proof that this token path works;
   verify the first run in your repository.
3. Add a Tavily API key as the repository Actions secret `TAVILY_API_KEY`. It
   enables external-source search/extraction and is passed explicitly.
4. Permit Actions to create pull-request reviews in Settings → Actions → General
   → Workflow permissions. Kestrel creates `COMMENT` reviews, never `APPROVE`
   or `REQUEST_CHANGES` events.

The public interface accepts no PAT, `COPILOT_GITHUB_TOKEN` secret, or `GH_AW_*`
token override. Only Tavily is forwarded; GitHub supplies the built-in token.
Keep explicit secret passing rather than using `secrets: inherit`.

## Add the caller

Commit this as `.github/workflows/review-pr.yml`. It matches
[Kestrel's own caller](../.github/workflows/review-pr.yml).

```yaml
name: Review pull request

on:
  pull_request_target:
    types: [opened, reopened, ready_for_review, synchronize, converted_to_draft]

permissions: {}

concurrency:
  group: kestrel-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    name: Review
    permissions:
      actions: read
      contents: read
      discussions: read
      issues: read
      pull-requests: write
      security-events: read
      vulnerability-alerts: read
      copilot-requests: write
    uses: Soulike/kestrel/.github/workflows/ai-review.yml@main
    with:
      review-prompt-path: ""
      model: ${{ vars.AI_REVIEW_MODEL || 'auto' }}
      reasoning-effort: high
    secrets:
      TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
```

The ceiling covers repository/PR evidence, run-attempt jobs, issue/discussion
context, code-scanning/Dependabot alerts, inference, and review publication.
Kestrel narrows permissions per job. The reviewer uses read-only GitHub tools;
the isolated publisher receives PR-write access. The gate reads PR state,
reviews, inline comments, and attempt jobs. No job receives issue-write access.
Optional evidence such as secret-scanning alerts may be inaccessible using this
token. If unavailable evidence is necessary to complete the review, the review
must remain incomplete; do not supply a broader token. See
[GitHub's permissions reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).

Call Kestrel once per caller workflow run. gh-aw derives artifact names from
inputs and attempt; identical sibling calls can collide. Per-PR cancellation
belongs to your caller, not a matching group in Kestrel.

## Configure the review

| Input                | Contract                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-prompt-path` | Optional repository-root-relative `.md` or `.markdown` path. Empty means shared criteria only. Missing files, directories, absolute paths, traversal, and escaping symlinks fail setup.           |
| `model`              | Defaults to `auto`; use a literal or your own variable. Copilot must support and authorize the selection. Kestrel does not substitute an unsupported selection.                                   |
| `reasoning-effort`   | Required: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Empty, whitespace-padded, and unsupported values fail before inference. The selected model must also support the effort. |

To extend shared criteria, commit a Markdown prompt such as
`docs/review-criteria.md` and set its path in the caller. Describe project-specific
responsibilities, conventions, and evidence. Do not repeat the output format or
ask the reviewer to run candidate tests, modify code, or merge.

Applicable instructions and the prompt come from the exact event **base** commit.
A prompt first added in a PR cannot judge that same PR: land it before enabling
its path. The proposed head is fetched as Git objects, not checked out. Kestrel
assets come from the invoked workflow's exact commit, independently of both
consumer revisions.

Latest general review Skills and the knowledge-base plugin supply correctness,
security, documentation, design, and test-review guidance. Consumers do not need
pnpm, Kestrel scripts, a knowledge-base checkout, or a gh-aw compiler. Your
repository's PR-admission settings remain yours: Kestrel's collaborator-only
policy is not a consumer prerequisite. Native gh-aw actor authorization remains.

## Verify and require the gate

After the caller and prompt reach your default branch, trigger a fresh ready PR
event. The introducing PR cannot prove a newly deployed `pull_request_target`
implementation. Check the full run before requiring its gate:

1. Setup selects the latest stable Copilot CLI and verifies the installed
   version; credentials, billing, and model access succeed.
2. Checkouts use the consumer event base and invoked Kestrel SHA, and the fetched
   head matches the event head.
3. A `github-actions[bot]` comment review targets that head. It visibly records
   model, verdict, severity totals, and reviewed head. Exercise an actionable
   inline finding as well as a clean result.
4. The gate authenticates framework attribution, invocation/publisher check IDs,
   current run attempt, implementation SHA, current PR state, and exact inline
   plus body-only counts. `approved` passes; `needs-change` fails explicitly.
5. Observe the actual qualified check name. With this caller, expect
   `Review / Engine / AI review gate`, but select the name GitHub actually emits
   in the branch's required-check settings. Bind the check to GitHub Actions
   where supported. A predicted name is not verification.

Keep human merge control and ordinary candidate CI. A passing review gate is
not a GitHub approval. Kestrel self-consumption is not evidence that your own
cross-repository access, billing, and organization policy have been validated.

## Drafts, changes, and recovery

Drafts do not run inference or publish a verdict. Their non-passing gate explains
that they must be ready. Marking ready starts a new review. A new head or
conversion to draft cancels superseded work. The current base/head, open state,
and draft state are rechecked before publication and at the gate.

For execution, configuration, or publication failure, inspect the failing job,
correct its cause, then choose **Re-run all jobs**. Do not rerun only failed jobs
or an individual stage. If base/head moved, trigger a fresh supported PR event
so the new event contains current revisions. Old or partial attempts cannot
satisfy the new attempt's gate.

An interrupted attempt can leave visible comments. Publication and the gate
are not atomic; Kestrel does not destructively clean up old comments. Missing,
ambiguous, malformed, or incomplete output and failed prerequisites have no
review verdict. An authenticated `needs-change` is instead a completed content
assessment: address or discuss the findings.

Consumers follow `main`, with no release or version-bump process. If a Kestrel
change breaks reviews, report its run URL and implementation SHA. Follow your
administrator recovery procedure; do not manufacture a passing review result.
