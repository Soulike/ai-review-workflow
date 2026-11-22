---
name: AI review (DeepSeek Web MCP)

on:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  needs: [prepare]
  workflow_call:
    inputs:
      review-prompt-path:
        type: string
        required: false
        default: ""
        description: Optional Markdown review criteria from the exact event base.
      model:
        type: string
        required: false
        default: auto
        description: Copilot model selection.
      reasoning-effort:
        type: string
        required: true
        description: Concrete Copilot reasoning effort.
    secrets:
      DEEPSEEK_API_KEY:
        required: true

inlined-imports: true

checkout: false

engine:
  id: copilot
  concurrency: "gh-aw-copilot-review-${{ github.run_id }}"
  model: ${{ inputs.model || 'auto' }}
  command: >-
    exec "${RUNNER_TEMP}/gh-aw/bin/copilot" --reasoning-effort "${AI_REVIEW_REASONING_EFFORT:?reasoning effort is required}"

permissions:
  actions: read
  checks: read
  contents: read
  discussions: read
  issues: read
  pull-requests: read
  security-events: read
  statuses: read
  vulnerability-alerts: read
  copilot-requests: write

imports:
  - shared/review-core.md

mcp-servers:
  deepseek-web:
    command: npx
    args: ["-y", "@soulike/deepseek-web-mcp@latest"]
    env:
      DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
    allowed: [deepseek_search, deepseek_fetch]

network:
  allowed: [api.deepseek.com]
  allowed-input: true
---

{{#runtime-import .github/workflows/shared/review-prompt.md}}
