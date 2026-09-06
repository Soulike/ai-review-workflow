# Development and operations

Use current Node LTS (`nvm use` reads `.nvmrc`) and the pnpm version declared in
`package.json`. The Node engine minimum describes supported language features,
not a fixed CI selection. Authored Actions use version tags; consumers use
`main`.

## Local validation

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

`pnpm lint:fix` and `pnpm format` explicitly edit local files. ESLint owns code
quality and TypeScript rules; Prettier owns formatting. Node executes TypeScript
through type stripping; `tsc` checks it separately.

For full validation, install official gh-aw **v0.88.2** and **actionlint
v1.7.12**. If gh-aw is not already installed:

```sh
gh extension install github/gh-aw --pin v0.88.2
```

If another version is installed, select an isolated official release binary
using the absolute `GH_AW_COMPILER` path. The compiler check rejects version
mismatches. Install actionlint from its
[official release](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) and
verify the archive against published checksums. `ACTIONLINT` may select an
isolated binary. `pnpm tools:setup` provisions the Linux GitHub Actions runner,
not a developer machine.

```sh
pnpm workflows:compile
pnpm workflows:lint
pnpm check
```

Commit source and generated files together. `workflows:check` recompiles and
rejects modified, deleted, or untracked generated artifacts relative to Git. A
newly generated artifact must be committed before the drift check can pass.
`check` runs typechecking, ESLint, Prettier, Node tests, compilation/drift
validation, and actionlint. Read-only candidate PR CI invokes these same package
scripts with no review credentials.

The compiler's `--validate` does not invoke actionlint. `workflows:lint` does so
explicitly, with shellcheck disabled and narrow compatibility exclusions for the
new `copilot-requests`/`vulnerability-alerts` permission names,
`job.workflow_repository`/`job.workflow_sha`, and concurrency `queue`. These
documented GitHub.com features postdate actionlint 1.7.12. Recheck and remove
exclusions on upgrade, without suppressing unrelated syntax/permission errors.
Compiler schema and template-injection validation still run.

## Repository layout

This repository ships a reusable workflow, not a published JavaScript library.

```text
.github/workflows/
  ai-review.yml       Public reusable interface; forwards inputs and secrets
  review.md           Review prompt and orchestration source
  review.lock.yml     Compiled executable workflow; do not edit by hand
  review-pr.yml       This repository's caller of the public interface
  ci.yml              Candidate-code validation
src/                  Importable implementation modules and Node tests
scripts/              Executable command entrypoints and runner setup scripts
docs/                 Consumer setup, repository conventions, and decisions
package.json          Shared local/CI command entrypoints
```

`src/` owns reusable behavior: input validation, Git preparation, review
parsing, gate decisions, GitHub API access, and compiler invocation. These
modules may perform I/O; the distinction is that callers import their functions
or classes instead of starting them as commands. `config.ts` decodes trusted
PR/run/event identity, while `configuration.ts` validates consumer review
settings and reads the repository prompt.

`scripts/` adapts that behavior to a process: command-line arguments,
environment variables, workflow files/outputs, diagnostics, and exit status. It
also contains runner-specific shell operations, such as installing validation
tools and checking Git credentials. Run these through the package scripts or
workflow steps; production modules in `src/` do not import executable
entrypoints.

For example, `pnpm preflight` starts `scripts/preflight.ts`, which reads
arguments and environment variables and calls `src/configuration.ts`. The gate
job starts `scripts/review-gate.ts`, which assembles context and calls
`src/review-gate.ts` with the API client from `src/github.ts`. Put a changed
validation or verdict rule in `src/`; put a changed environment mapping or
process diagnostic in `scripts/`; put triggers, permissions, job dependencies,
and reviewer instructions in the workflow files.

Tests live under `src/` and are discovered by `pnpm test`. Most are adjacent to
the module they exercise. The `*-cli.test.ts` files execute command entrypoints;
`workflow.test.ts` executes owned script fragments from the compiled workflow
and checks the documented caller example. Neither is a local GitHub Actions
emulator.

## Implementation boundaries

The public interface calls the same-revision compiled engine and forwards only
Tavily, isolating compiler-added `aw_context` and optional token overrides from
consumer configuration. `review.lock.yml`, `.github/aw/`, and generated
attributes are compiler-owned. gh-aw resolves source action tags to hashes; do
not hand-maintain or reformat generated hashes.

The reviewer uses exact consumer-base instructions and separate implementation
assets. Automatic checkout is disabled because this compiler cannot infer the
caller's target-event checkout protection from `workflow_call`. Explicit
pre-Agent checkouts select trusted revisions, and no consumer dependencies are
installed. CI alone executes candidate tests. Broad sandbox tools remain;
non-execution of PR code is an instruction, not a technical confinement
guarantee.

Keep compiler/runtime versions coordinated. The small custom Copilot launcher
forwards validated reasoning effort safely because this compiler cannot compile
a dynamic `engine.args` expression. A custom command disables gh-aw's automatic
CLI installation, so a pre-Agent step explicitly invokes the same gh-aw
installer with the selected version and stages the binary on its read-only
runtime mount. The compiled installation/staging and launcher argument path are
tested. A publisher pre-step records native job identity at step scope; gh-aw
appends its footer after the Agent body. The gate does not authenticate by a
short job name.

## Choosing and validating tests

Keep tests that exercise an owned behavior and detect a distinct realistic
fault: parsing untrusted input, authenticating a result, fetching Git evidence,
translating paginated API responses, or running a command with the right
arguments and failure status. Test detailed decisions at the module that owns
them; use executable entrypoint tests for process contracts and cross-module
wiring.

Do not duplicate workflow literals in Node assertions as a substitute for
testing GitHub behavior. Compilation and actionlint validate workflow structure;
review the configuration and verify checkout revisions, effective permissions,
cancellation, job ordering, and publication on GitHub. Script-fragment tests
prove only the locally executed code, not how GitHub supplies its context or
schedules it. The caller-example comparison protects documentation consistency,
not execution.

Before removing or consolidating a test, identify what protection remains. For
example, compiler tests execute both the standalone binary path and `gh aw`, and
the drift test runs `scripts/check.ts` in a temporary Git repository whose
compiler changes generated files. Assertions about those child-process results
protect more than a second copy of the helper's return object. Keep an
independent expected result and a valid control alongside rejection cases. Exact
model prose is not a golden test oracle, and local tests do not establish live
inference or authorization.

## Activation and main recovery

This repository uses the public `@main` interface for self-review. Bootstrap
with candidate CI and human review/merge. Then exercise a fresh real PR using
the [first-run checks](docs/consumer-setup.md#verify-and-require-the-gate)
before requiring the observed gate. Record run/attempt, consumer base/head,
implementation SHA, publisher/check IDs, and content verdict separately from
workflow health in the delivery issue/PR. Local tests or an old deployed review
cannot prove activation.

The repository policy is public MIT distribution with collaborator-only PR
creation. It does not restrict downstream repos, issues, or comments. Once
activation is complete, main requires PRs and the observed candidate/review
checks. A single-maintainer project need not add a human approval count merely
to enforce PR-only changes.

For a broken `main`, prepare a focused fix/revert on a branch, run candidate CI,
and obtain human review/merge. If the deployed reviewer blocks recovery, an
authorized maintainer may temporarily relax only its required-check rule,
retaining PR-required changes and candidate CI. Record the reason, merge the
reviewed repair, verify a fresh deployed run, then restore/recheck the exact
required review check. Do not add automatic bypasses or direct pushes to main.

The prepare job exports its run attempt. Both the publication guard and final
gate require it to match the current attempt, preventing a failed-publication
rerun from treating earlier successful inference as fresh. Recovery reruns all
jobs.
