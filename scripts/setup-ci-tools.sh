#!/usr/bin/env bash
set -euo pipefail

gh extension install github/gh-aw --pin v0.88.2
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
