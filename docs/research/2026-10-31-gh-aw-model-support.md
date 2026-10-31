# gh-aw model support snapshot, 2026-10-31

On 2026-10-31, [v1.0.1](https://github.com/github/gh-aw/releases/tag/v1.0.1)
was the latest stable gh-aw release. This comparison uses the repository's
previous compiler pin, v0.92.0, as its baseline. Release status was checked
through the [latest-release API](https://api.github.com/repos/github/gh-aw/releases/latest).

## Bundled model metadata

The model IDs below were compared by provider in the tagged
[v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/js/models.json)
and [v1.0.1](https://github.com/github/gh-aw/blob/v1.0.1/actions/setup/js/models.json)
runtime catalogs. In each release, the runtime and CLI copies are byte-identical:
see the [v0.92.0 CLI catalog](https://github.com/github/gh-aw/blob/v0.92.0/pkg/cli/data/models.json)
and [v1.0.1 CLI catalog](https://github.com/github/gh-aw/blob/v1.0.1/pkg/cli/data/models.json).

| Provider section | v0.92.0 IDs | v1.0.1 IDs | Added                                   | Removed                   |
| ---------------- | ----------: | ---------: | --------------------------------------- | ------------------------- |
| GitHub Copilot   |          46 |         47 | `gpt-5.6-luna-utility`, `gpt-6.1-terra` | `mai-code-1-flash-picker` |
| OpenAI           |          62 |         63 | `gpt-6.1-terra`                         | None                      |
| Anthropic        |          31 |         31 | None                                    | None                      |

`gpt-6.1-terra` is one model ID appearing in two provider sections, not two
new models. Both added Copilot entries specify `wire_api: responses` in the
bundled metadata. The existing `mai-code-1.1-flash` entry remains present in
both releases. Separately, the only changed metadata on an unchanged ID is the
Anthropic `claude-sonnet-5-5` cache-read cost, from `2e-07` to `1e-07`.

GitHub's [supported-models documentation](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
lists GPT-6.1 Terra as generally available and includes Copilot CLI among its
supported clients. It lists GPT-5.6 Luna but does not separately identify a
Luna Utility model, so the `gpt-5.6-luna-utility` catalog entry alone does not
establish that it can be selected as a chat model. Availability to the
workflow's own identity and chosen client still needs a real run.

For reproducibility, the runtime and CLI catalogs have these SHA-256 values:

| Version | SHA-256                                                            |
| ------- | ------------------------------------------------------------------ |
| v0.92.0 | `c183b0204aff1f8436d87d808b0e79749968ae120ba7fe2bd8fc646d044bb4b0` |
| v1.0.1  | `1d13e6cdc7c36eef7117d46842516df50c799f0e2c4559b9d53690b0fbd38531` |

## Selection aliases and behavior

The built-in selection alias map changed from 62 aliases to 61. The sole
removed alias is `mai-code-1-flash-picker`; every other definition is unchanged.
See the [v0.92.0 map](https://github.com/github/gh-aw/blob/v0.92.0/pkg/workflow/data/model_aliases.json)
and [v1.0.1 map](https://github.com/github/gh-aw/blob/v1.0.1/pkg/workflow/data/model_aliases.json).
The v1.0.1 [runtime copy](https://github.com/github/gh-aw/blob/v1.0.1/actions/setup/js/model_aliases.json)
matches its compiler copy byte for byte. An ID missing from this alias map or
the bundled catalog is not, by itself, proof that its provider rejects it.

The selection resolver also changed when a name is both an alias and a live
model ID: [v1.0.1](https://github.com/github/gh-aw/blob/v1.0.1/actions/setup/js/resolve_model_alias.cjs)
prefers the exact live ID, while [v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/js/resolve_model_alias.cjs)
first expands the alias. In an offline probe with a simulated Copilot catalog
containing `gpt-5-mini` and `gpt-5.4-mini`, the same configured `gpt-5-mini`
resolved to `gpt-5.4-mini` in v0.92.0 and remained `gpt-5-mini` in v1.0.1.
Actual resolution depends on the workflow's live catalog.

The similarly named `model_aliases.cjs` is for compact summary rendering, not
this selection map. Its only change between the two releases is an example in
a comment: [v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/js/model_aliases.cjs),
[v1.0.1](https://github.com/github/gh-aw/blob/v1.0.1/actions/setup/js/model_aliases.cjs).

The v1.0.1 routing reference also permits aliases in
`engine.model-routing.allowed-models`, where the
[v0.92.0 reference](https://github.com/github/gh-aw/blob/v0.92.0/docs/src/content/docs/reference/model-routing.md)
specified exact names only. See the [v1.0.1 reference](https://github.com/github/gh-aw/blob/v1.0.1/docs/src/content/docs/reference/model-routing.md).
This repository does not enable `engine.model-routing` in its
[review workflow](../../.github/workflows/review.md).

## Execution boundary

The installer bundled with v1.0.1 has Copilot CLI `1.0.103` as its fallback,
compared with `1.0.96` in v0.92.0. Compatibility-matrix resolution and runner
caches can select a different version, so the bundled fallback does not prove
which CLI a workflow run used. See the tagged installer scripts for
[v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/sh/install_copilot_cli.sh)
and [v1.0.1](https://github.com/github/gh-aw/blob/v1.0.1/actions/setup/sh/install_copilot_cli.sh).

This comparison checked published source, metadata, documentation, and an
offline resolver example. It did not query model entitlement for the workflow
identity or execute a hosted review. Catalog presence establishes metadata, not
account access, numeric context capacity, or successful inference.
