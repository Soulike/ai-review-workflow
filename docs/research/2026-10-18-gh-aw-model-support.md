# gh-aw model support snapshot, 2026-10-18

The latest stable release is **v0.92.0**, published 2026-10-15 04:47 UTC.
The newest prerelease is **v0.92.5**, published 2026-10-17 22:22 UTC.
Neither adds model IDs relative to the repository's v0.91.12 compiler pin at
the time of this comparison.
Release status and timestamps were checked through GitHub's
[latest-release API](https://api.github.com/repos/github/gh-aw/releases/latest)
and [release list](https://api.github.com/repos/github/gh-aw/releases?per_page=5).
The current local pin is defined in [compiler-contract.ts](../../scripts/lib/compiler-contract.ts).

## Catalog comparison

Both `actions/setup/js/models.json` and `pkg/cli/data/models.json` were downloaded
at all three tags. Within each tag, the two catalogs are byte-identical. The
stable release's catalogs are also byte-identical to v0.91.12. Each contains
31 Anthropic, 46 GitHub Copilot, and 62 OpenAI entries. The prerelease retains
all those IDs and changes only the Anthropic `claude-sonnet-5-5` cache-read
cost from `2e-07` to `1e-07`.
Sources: [v0.91.12 runtime catalog](https://github.com/github/gh-aw/blob/v0.91.12/actions/setup/js/models.json),
[v0.92.0 runtime catalog](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/js/models.json),
[v0.92.5 runtime catalog](https://github.com/github/gh-aw/blob/v0.92.5/actions/setup/js/models.json),
and their CLI copies at
[v0.91.12](https://github.com/github/gh-aw/blob/v0.91.12/pkg/cli/data/models.json),
[v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/pkg/cli/data/models.json), and
[v0.92.5](https://github.com/github/gh-aw/blob/v0.92.5/pkg/cli/data/models.json).

Recent-looking Copilot IDs already present in v0.91.12 include `gpt-6.1-sol`,
`gpt-6-sol`, `gpt-6-astra`, `gpt-6-luna`, `claude-opus-5.5`,
`claude-sonnet-5.5`, `claude-haiku-5.5`, `gemini-3.8-flash`, `grok-4.7`,
and `kimi-k3`.
Sources: [Claude IDs](https://github.com/github/gh-aw/blob/v0.91.12/actions/setup/js/models.json#L288-L424)
and [other Copilot IDs](https://github.com/github/gh-aw/blob/v0.91.12/actions/setup/js/models.json#L425-L713).

The built-in `model_aliases.cjs` file is also byte-identical at
[v0.91.12](https://github.com/github/gh-aw/blob/v0.91.12/actions/setup/js/model_aliases.cjs),
[v0.92.0](https://github.com/github/gh-aw/blob/v0.92.0/actions/setup/js/model_aliases.cjs), and
[v0.92.5](https://github.com/github/gh-aw/blob/v0.92.5/actions/setup/js/model_aliases.cjs).

SHA-256 for reproducibility:

| Compared artifact              | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| Catalogs, v0.91.12 and v0.92.0 | `c183b0204aff1f8436d87d808b0e79749968ae120ba7fe2bd8fc646d044bb4b0` |
| Catalogs, v0.92.5              | `75bbfd58d221ac705d2512a21a5cb35660e076fddfb2e38f5b684beb2376a11f` |
| Aliases, all three versions    | `5d731d1ba3bf80cd3107799441c53a8876f1685ab2c08d243958243be65f7a45` |

## What changed for models

v0.92.0 improves routing correctness: Claude Code receives a `modelOverrides`
map translating Anthropic's hyphenated IDs to Copilot's dotted IDs; Copilot
rejects silent substitution of a configured model; and an omitted
`allowed-models` means any model when merging imports.
Sources: [v0.92.0 release](https://github.com/github/gh-aw/releases/tag/v0.92.0)
and [Claude mapping implementation](https://github.com/github/gh-aw/blob/v0.92.0/pkg/workflow/claude_copilot_model_overrides.go#L17-L69).
The v0.92.5 prerelease additionally advertises unavailable-model diagnostics and
honoring runtime detection-model overrides.
Source: [v0.92.5 release](https://github.com/github/gh-aw/releases/tag/v0.92.5).

Catalog membership establishes bundled metadata, not availability for a
particular credential or successful execution. Automatic routing additionally
depends on its pinned benchmark data and the organization's available Copilot
models; it currently supports Copilot inference only.
Source: [versioned routing reference](https://github.com/github/gh-aw/blob/v0.92.0/docs/src/content/docs/reference/model-routing.md#L190-L194)
and [provider restriction](https://github.com/github/gh-aw/blob/v0.92.0/docs/src/content/docs/reference/model-routing.md#L290-L292).
This investigation compared published metadata and source. It did not upgrade
the compiler, query account-specific model entitlements, or run hosted workflows.
