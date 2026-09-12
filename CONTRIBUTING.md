# Contributing

This guide covers changing and validating the shared workflow. To use it in
another repository, follow the [consumer setup guide](docs/consumer-setup.md).

## Before you start

Use [GitHub Issues](https://github.com/Soulike/ai-review-workflow/issues) for bug
reports, requests, and engineering specifications. Pull requests are for
implementation changes and can only be opened by this repository's
collaborators. This restriction does not apply to issues, comments, or consumer
repositories.

Read the [domain language](CONTEXT.md) and relevant
[architectural decisions](docs/adr/) before changing behavior. Work on a branch
from current `main`; changes to `main` go through pull requests. Preserve
applicable copyright and permission notices when reusing code or documentation.

## Set up the development environment

Use current Node LTS (`nvm use` reads `.nvmrc`) and the pnpm version declared in
[`package.json`](package.json). The Node engine minimum describes supported
language features, not a fixed CI selection.

```sh
pnpm install --frozen-lockfile --ignore-scripts
```

Workflow validation also needs Git, GitHub CLI, gh-aw **v0.88.7**, and
**actionlint v1.7.12**. If the gh-aw extension is not already installed:

```sh
gh extension install github/gh-aw --pin v0.88.7
```

If another gh-aw version is installed, select an isolated official release
binary using the absolute `GH_AW_COMPILER` path. The compiler check rejects
version mismatches. Install actionlint from its
[official release](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) and
verify the archive against published checksums. `ACTIONLINT` may select an
isolated binary. `pnpm tools:setup` provisions the Linux GitHub Actions runner,
not a developer machine.

## Find the code to change

This repository ships a reusable workflow, not a published JavaScript library.

```text
.github/workflows/
  ai-review.yml       Public reusable interface; forwards inputs and secrets
  review.md           Review prompt and orchestration source
  review.lock.yml     Compiled executable workflow; do not edit by hand
  review-pr.yml       This repository's caller of the public interface
  ci.yml              Candidate-code validation
  review.test.ts      Workflow installer/launcher tests
scripts/              Commands launched by workflows or package.json
  lib/                Internal modules imported by those commands
docs/                 Consumer setup, repository conventions, and decisions
package.json          Shared local/CI command entrypoints
```

Keep executable entrypoints at the top of `scripts/` and the modules they import
in `scripts/lib/`. Entrypoints connect a task to command-line arguments,
environment variables, workflow outputs, diagnostics, and exit status. Internal
modules own behavior such as input validation, Git preparation, and structured
results. Both support the review runtime and development tooling; internal
modules may also perform I/O.

For example, [`write-review-result.ts`](scripts/write-review-result.ts) and
[`review-gate.ts`](scripts/review-gate.ts) are commands that both import
[`lib/review-result.ts`](scripts/lib/review-result.ts). Change verdict rules in
the module; change argument handling or failure reporting in the entrypoint.
Internal modules do not import executable entrypoints. Standalone commands such
as [`setup-ci-tools.sh`](scripts/setup-ci-tools.sh) need no matching module.

Keep `*.test.ts` files beside the code they exercise: module tests in
`scripts/lib/`, command tests at the top of `scripts/`, and workflow tests in
`.github/workflows/`. There is no separate tests directory.

Put triggers, permissions, job dependencies, and reviewer instructions in the
workflow sources. The public interface calls the same-revision compiled engine
and forwards only the Tavily secret, keeping compiler-added `aw_context` and
optional token overrides out of the consumer interface. Update the
[consumer guide](docs/consumer-setup.md) when changing that interface or its
observable behavior.

## Change and compile workflows

Edit `review.md`, then regenerate the executable workflow:

```sh
pnpm workflows:compile
```

Review and commit the source and generated changes together. `review.lock.yml`,
`.github/aw/`, and generated entries in `.gitattributes` are compiler-owned.
Authored Actions use version tags; gh-aw resolves those tags to hashes. Do not
hand-edit or reformat generated artifacts.

When changing workflow setup, preserve these implementation constraints:

- Explicit pre-Agent checkouts select consumer-base instructions separately
  from implementation assets. Automatic checkout is disabled because gh-aw
  cannot infer the caller's target-event checkout protection from `workflow_call`.
  Do not install consumer dependencies or ask the reviewer to run candidate
  code. Candidate tests belong to separate CI; broad sandbox tools remain, so
  the non-execution rule is an instruction, not a technical barrier.
- The custom Copilot launcher passes validated reasoning effort because placing
  a dynamic `engine.args` expression in the generated execution command exceeds
  GitHub's expression size limit. A custom command disables automatic CLI
  installation, so the pre-Agent step invokes gh-aw's compatibility-aware
  installer without a version override and stages the selected binary on the
  read-only runtime mount. The install step log identifies the concrete CLI
  selected at runtime; with no `engine.version`, gh-aw v0.88.7's generated
  metadata shows its baked fallback instead of the compatibility-resolved
  version. Keep compiler/runtime versions coordinated in
  [`compiler-contract.ts`](scripts/lib/compiler-contract.ts) and workflow setup.
- `network.allowed` in `review.md` owns the defaults. Native
  `network.allowed-input` adds the `network_allowed` input; the public interface
  forwards it unchanged and gh-aw merges additions before starting the firewall.

For verdict and publication changes, preserve the
[stateless structured-result contract](docs/adr/0008-use-stateless-structured-review-results.md).
The gate consumes the result artifact, prerequisite job outcomes, and applied
publication status. A successful publication job that skipped the required
review cannot satisfy the gate. Review prose and current PR state are not gate
inputs.

## Test and validate your change

Before committing, run the individual checks after regenerating any affected
workflow artifacts:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm workflows:lint
```

Node executes TypeScript through type stripping; `tsc` checks types separately.
ESLint owns code quality and TypeScript rules; Prettier owns formatting.
`pnpm lint:fix` and `pnpm format` explicitly edit local files.

Compilation validates the gh-aw schema and template expressions, but does not
run actionlint. `workflows:lint` checks that the caller, wrapper, and compiled
reviewer retain `checks: read` and `statuses: read` for GitHub evidence tools,
then invokes actionlint with shellcheck disabled and narrow compatibility
exclusions in [`lint-workflows.ts`](scripts/lint-workflows.ts). Recheck those
exclusions when upgrading actionlint; remove obsolete ones without suppressing
unrelated errors. These static checks do not establish private-token API access.

After committing source and generated changes, run the full CI check:

```sh
pnpm check
```

This repeats the checks above and runs `workflows:check`, which recompiles and
rejects any modified, deleted, or untracked generated artifacts relative to
`HEAD`. Correct but uncommitted generated changes also fail this check; staging
them is not sufficient. If compilation produces further changes, inspect and
commit them with the corresponding source before rerunning `pnpm check`.

### Choose useful tests

`pnpm test` discovers colocated tests in `scripts/` (including `lib/`) and
`.github/workflows/`. Use module tests for owned decisions and `*-cli.test.ts`
tests for process contracts and cross-module wiring. Each test should detect a
distinct realistic fault. Keep independent expected results and a valid control
alongside rejection cases; identify what protection remains before removing or
consolidating a test.

Do not duplicate workflow literals in Node assertions as a substitute for
testing GitHub behavior. [`review.test.ts`](.github/workflows/review.test.ts) executes
installer/launcher fragments; it does not emulate Actions. Local tests cannot
establish live inference, authorization, checkout context, scheduling, or
publication. Exact model prose is not a golden
test oracle.

## Submit and verify a pull request

Explain the change and its validation in the PR, and link its issue when
applicable. Candidate CI runs the package checks against proposed code with
read-only permissions and no review credentials. The PR merge box and
[repository rules](https://github.com/Soulike/ai-review-workflow/rules) define
the required checks and human approvals. A passing AI review gate is not a
human approval or permission to merge.

Consumers, including this repository, use `@main`; there is no release or
version-bump process. Self-review exercises the deployed workflow, not the
workflow changes proposed in that PR. After merging execution changes, verify
a fresh PR run using the
[live verification checklist](docs/consumer-setup.md#verify-and-require-the-gate).
Record its run URL, event revisions, implementation SHA, and structured verdict
in the issue or PR, distinguishing review content from workflow health.

For failed runs, use the
[rerun and artifact guidance](docs/consumer-setup.md#drafts-changes-and-recovery).
If broken `main` prevents a repair PR from passing review, an authorized
maintainer may temporarily relax only the review's required-check rule. Keep
PR-required changes and candidate CI, record the reason, and obtain human
review/merge of a focused fix or revert. Verify a fresh deployed run before
restoring and rechecking the required review check. Do not add automatic
bypasses or push repairs directly to `main`.
