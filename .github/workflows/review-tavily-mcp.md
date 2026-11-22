---
name: AI review (Tavily MCP)

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
      TAVILY_API_KEY:
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
  - shared/review-prompt.md

mcp-servers:
  tavily:
    type: http
    url: https://mcp.tavily.com/mcp/
    headers:
      Authorization: Bearer ${{ secrets.TAVILY_API_KEY }}
    allowed: [tavily_search, tavily_extract]

network:
  allowed: [mcp.tavily.com]
  allowed-input: true
---

Follow the imported pull-request review instructions.
