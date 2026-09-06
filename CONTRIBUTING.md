# Develop and operate Kestrel

Use current Node LTS (`nvm use` reads `.nvmrc`) and the pnpm version declared in
`package.json`. The Node engine minimum describes supported language features,
not a fixed CI selection. Authored Actions use version tags; consumers use `main`.

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

For full validation, install official gh-aw **v0.88.2** and **actionlint v1.7.12**.
If gh-aw is not already installed:

```sh
gh extension install github/gh-aw --pin v0.88.2
```

If another version is installed, select an isolated official release binary
using the absolute `GH_AW_COMPILER` path. Kestrel rejects version mismatches.
Install actionlint from its [official release](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)
and verify the archive against published checksums. `ACTIONLINT` may select an
isolated binary. `pnpm tools:setup` provisions the Linux GitHub Actions runner,
not a developer machine.

```sh
pnpm workflows:compile
pnpm workflows:lint
pnpm check
```

Commit source and generated files together. `workflows:check` recompiles and
rejects modified, deleted, or untracked generated artifacts relative to Git. A
newly generated artifact must be committed before the drift check can
pass. `check` runs typechecking, ESLint, Prettier, Node tests, compilation/drift
validation, and actionlint. Read-only candidate PR CI invokes these same package
scripts with no review credentials.

The compiler's `--validate` does not invoke actionlint. `workflows:lint` does so
explicitly, with shellcheck disabled and narrow compatibility exclusions for
the new `copilot-requests`/`vulnerability-alerts` permission names,
`job.workflow_repository`/`job.workflow_sha`, and concurrency `queue`. These
documented GitHub.com features postdate actionlint 1.7.12. Recheck and remove
exclusions on upgrade, without suppressing unrelated syntax/permission errors.
Compiler schema and template-injection validation still run.

## Implementation boundaries

- `.github/workflows/ai-review.yml` owns the public three-input interface. It
  calls the same-revision compiled engine and forwards only Tavily, isolating
  compiler-added `aw_context` and optional token overrides from public config.
- `.github/workflows/review.md` owns the shared prompt and orchestration.
  `review.lock.yml`, `.github/aw/`, and generated attributes are compiler-owned.
  gh-aw resolves source action tags to hashes; do not hand-maintain or reformat
  generated hashes.
- `src/` owns input preparation, Git evidence, review parsing/authentication,
  GitHub access, and compiler invocation. `scripts/` owns executable entrypoints
  and runner setup.
- The reviewer uses exact consumer-base instructions and separate Kestrel assets.
  It installs no consumer dependencies. CI alone executes candidate tests. Broad
  sandbox tools remain; non-execution of PR code is an instruction, not a
  technical confinement guarantee.

Tests port the established parser/gate/adapter protection and cover base prompt
selection, real Git fetching without head checkout, executable argument/error
handling, real Octokit pagination with controlled HTTP responses, publication
identity, counts, lifecycle state, and current-attempt enforcement. Cross-field
tests check compiled wiring. None substitutes for live inference, authorization,
publication, or cross-repository validation; exact model prose is not a golden
test oracle.

Keep compiler/runtime versions coordinated. The small custom Copilot launcher
forwards validated reasoning effort safely because this compiler cannot compile
a dynamic `engine.args` expression. Its argument behavior is tested. A publisher
pre-step records native job identity at step scope; gh-aw appends its footer after
the Agent body. The gate does not authenticate by a short job name.

## Activation and main recovery

Kestrel uses its public `@main` interface. Bootstrap with candidate CI and human
review/merge. Then exercise a fresh real PR using the
[first-run checks](docs/consumer-setup.md#verify-and-require-the-gate) before
requiring the observed gate. Record run/attempt, consumer base/head, implementation
SHA, publisher/check IDs, and content verdict separately from workflow health in
the delivery issue/PR. Local tests or an old deployed review cannot prove activation.

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

Knowledge-base is an upstream source/plugin, not an adoption target in this
delivery. Changes there require separate authorization. Preserve the extracted
code's MIT notice in `LICENSE`.
