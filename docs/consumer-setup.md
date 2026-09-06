# Set up AI reviews

The reusable workflow targets GitHub.com, Copilot CLI, and GitHub-hosted Linux
runners. You need permission to configure Actions, secrets, and branch rules.
GitHub Enterprise Server and alternative provider credentials are outside this
interface.

## Prerequisites

1. Enable Actions and allow the actions used by the workflow, including reusable
   workflows from `Soulike/ai-review-workflow`. Parent policies must allow the
   permission ceiling in the caller below.
2. Establish Copilot CLI inference access using the built-in `GITHUB_TOKEN` and
   `copilot-requests: write`. YAML permission alone does not grant entitlement
   or billing access. Follow
   [GitHub's current prerequisites](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli-in-actions).
   The documented organization path requires its policy allowing
   organization-billed CLI use. A personal subscription alone is not proof that
   this token path works; verify the first run in your repository.
3. Add a Tavily API key as the repository Actions secret `TAVILY_API_KEY`. It
   enables external-source search/extraction and is passed explicitly.
4. Permit Actions to create pull-request reviews in Settings → Actions → General
   → Workflow permissions. The workflow creates `COMMENT` reviews, never
   `APPROVE` or `REQUEST_CHANGES` events.

The public interface accepts no PAT, `COPILOT_GITHUB_TOKEN` secret, or `GH_AW_*`
token override. Only Tavily is forwarded; GitHub supplies the built-in token.
Keep explicit secret passing rather than using `secrets: inherit`.

Under Settings → Secrets and variables → Actions → Variables, configure the
repository variables used by the caller below:

- `AI_REVIEW_REASONING_EFFORT` is required. Set a concrete supported value such
  as `high`; there is no fallback when it is unset or invalid.
- `AI_REVIEW_MODEL` is optional. Leave it unset to use `auto`.
- `AI_REVIEW_NETWORK_ALLOWED` is optional. Leave it unset to use the default
  network allowlist, or supply additions as described under
  [extra network access](#extra-network-access).

These are non-secret settings. They are forwarded to the reusable workflow's
inputs; changing them does not require editing the workflow. See the
[input contract](#configure-the-review) for supported values.

## Add the caller

Commit this as `.github/workflows/review-pr.yml`. It matches
[this repository's caller](../.github/workflows/review-pr.yml).

```yaml
name: Review pull request

on:
  pull_request_target:
    types: [opened, reopened, ready_for_review, synchronize, converted_to_draft]

permissions: {}

concurrency:
  group: ai-review-pr-${{ github.event.pull_request.number }}
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
    uses: Soulike/ai-review-workflow/.github/workflows/ai-review.yml@main
    with:
      review-prompt-path: ""
      model: ${{ vars.AI_REVIEW_MODEL || 'auto' }}
      reasoning-effort: ${{ vars.AI_REVIEW_REASONING_EFFORT }}
      network_allowed: ${{ vars.AI_REVIEW_NETWORK_ALLOWED }}
    secrets:
      TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
```

The ceiling covers repository/PR evidence, Actions evidence, issue/discussion
context, code-scanning/Dependabot alerts, inference, and review publication. The
shared workflow narrows permissions per job. The reviewer uses read-only GitHub
tools; the isolated publisher receives PR-write access. The gate reads only
run-local job outcomes and the structured result artifact, without querying PR
state or published reviews. No job receives issue-write access.
Optional evidence such as secret-scanning alerts may be inaccessible using this
token. If unavailable evidence is necessary to complete the review, the review
must remain incomplete; do not supply a broader token. See
[GitHub's permissions reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).

Invoke the reusable workflow once per caller workflow run. gh-aw derives
artifact names from inputs and attempt; identical sibling calls can collide.
Per-PR cancellation belongs to your caller, not a matching group in the shared
workflow.

## Configure the review

| Input                | Contract                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-prompt-path` | Optional repository-root-relative `.md` or `.markdown` path. Empty means shared criteria only. Missing files, directories, absolute paths, traversal, and escaping symlinks fail setup.           |
| `model`              | Defaults to `auto`; use a literal or your own variable. Copilot must support and authorize the selection. The workflow does not substitute an unsupported selection.                              |
| `reasoning-effort`   | Required: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. Empty, whitespace-padded, and unsupported values fail before inference. The selected model must also support the effort. |
| `network_allowed`    | Optional comma-separated domains or gh-aw ecosystem identifiers. Empty keeps the default allowlist; entries add to it. See [extra network access](#extra-network-access).                         |

To extend shared criteria, commit a Markdown prompt such as
`docs/review-criteria.md` and set its path in the caller. Describe
project-specific responsibilities, conventions, and evidence. Do not repeat the
output format or ask the reviewer to run candidate tests, modify code, or merge.

Applicable instructions and the prompt come from the exact event **base**
commit. A prompt first added in a PR cannot judge that same PR: land it before
enabling its path. The proposed head is fetched as Git objects, not checked out.
Workflow implementation assets come from the invoked workflow's exact commit,
independently of both consumer revisions.

The workflow installs the latest review Skills and reference material for
correctness, security, documentation, design, and test-review guidance.
Consumers do not need pnpm, workflow implementation scripts, or a gh-aw
compiler. Your repository's PR-admission settings remain yours: the workflow
repository's collaborator-only policy is not a consumer prerequisite. Native
gh-aw actor authorization remains.

### Extra network access

The default sandbox allowlist includes Tavily (`mcp.tavily.com`) and gh-aw's
`github` domain group, including GitHub documentation and raw file hosts. To
allow other sources, set `AI_REVIEW_NETWORK_ALLOWED`, or pass `network_allowed`
directly in the caller. For example, `node,python,docs.example.com` adds the Node
and Python ecosystem domains plus a project-specific documentation host.

Entries are comma-separated; domains also allow their subdomains. Additions are
combined with the defaults, not substituted for them. Use trusted caller
configuration or repository variables, not PR-provided content. This input
extends sandbox network access; it does not provide credentials or change GitHub
permissions. See gh-aw's [network reference](https://github.github.com/gh-aw/reference/network/#caller-extensible-allowlist-networkallowed-input)
for supported ecosystem identifiers and domain syntax.

## Verify and require the gate

After the caller and prompt reach your default branch, trigger a fresh ready PR
event. The introducing PR cannot prove a newly deployed `pull_request_target`
implementation. Check the full run before requiring its gate:

1. Setup selects the latest stable Copilot CLI and verifies the installed
   version; credentials, billing, and model access succeed.
2. Checkouts use the consumer event base and invoked workflow implementation
   SHA, and the fetched head matches the event head.
3. A `github-actions[bot]` comment review targets that head. It visibly records
   model, severity totals, and reviewed head. Exercise an actionable
   inline finding as well as a clean result.
4. The custom safe-output job uploads `review-result.json` with a structured
   `verdict`. With successful prerequisites, `approved` passes and
   `needs-change` fails explicitly. The gate never parses review Markdown.
5. Observe the actual qualified check name. With this caller, expect
   `Review / Engine / AI review gate`, but select the name GitHub actually emits
   in the branch's required-check settings. Bind the check to GitHub Actions
   where supported. A predicted name is not verification.

Keep human merge control and ordinary candidate CI. A passing review gate is not
a GitHub approval. Self-review in the workflow repository is not evidence that
your own cross-repository access, billing, and organization policy have been
validated.

## Drafts, changes, and recovery

Drafts do not run inference or publish a verdict; skipped prerequisites prevent
the gate from passing. Marking ready starts a review. The caller cancels
superseded work on a new head or conversion to draft.

Each workflow run reviews its event's fixed change independently. Publication
does not recheck the PR's current open/draft/base/head state, and runs do not
reconcile one another's comments.

For an execution or publication failure, correct its cause and choose
**Re-run failed jobs**. Successful inference and publication jobs can be reused;
the verdict artifact is retained for **30 days**. Other artifacts follow
gh-aw and repository retention settings. Re-running only the gate reads the existing result and does not
publish again. If a required framework artifact expired or was deleted, choose
**Re-run all jobs**. gh-aw may also report an artifact-name conflict when a
failed framework job is rerun after already uploading its artifact; use a full
rerun in that case. The verdict upload itself permits replacement. To review a different head, trigger a new supported PR
event rather than rerunning the old event.

A rerun of publication may leave more than one visible review. This is accepted;
there is no deduplication or cleanup. Missing, malformed, duplicate, or incomplete
safe-output results and failed prerequisites cannot pass the gate. A valid
`needs-change` is a completed content assessment: address or discuss the
findings; rerunning the gate does not change that verdict.

Consumers follow `main`, with no release or version-bump process. If an upstream
workflow change breaks reviews, report its run URL and implementation SHA.
Follow your administrator recovery procedure; do not manufacture a passing
review result.
