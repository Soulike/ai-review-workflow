#!/usr/bin/env bash
set -euo pipefail

# Keep CI on the compiler selected by scripts/lib/compiler-contract.ts. Before
# upgrading, verify the selected Gateway fixes nested review_threads and passes
# a fresh consumer run: https://github.com/github/gh-aw-mcpg/issues/15838
gh extension install github/gh-aw --pin v0.92.0
tools_dir="$(mktemp -d "${RUNNER_TEMP}/workflow-tools.XXXXXX")"
gh release download v1.7.12 --repo rhysd/actionlint \
  --pattern actionlint_1.7.12_linux_amd64.tar.gz \
  --pattern actionlint_1.7.12_checksums.txt --dir "$tools_dir"
(
  cd "$tools_dir"
  grep ' actionlint_1.7.12_linux_amd64.tar.gz$' actionlint_1.7.12_checksums.txt | sha256sum --check --strict
  tar -xzf actionlint_1.7.12_linux_amd64.tar.gz actionlint
  ./actionlint -version
)
printf '%s\n' "$tools_dir" >> "$GITHUB_PATH"
