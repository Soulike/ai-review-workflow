---
env:
  AI_REVIEW_REASONING_EFFORT: ${{ inputs.reasoning-effort }}
  DISABLE_TELEMETRY: "1"

tools:
  bash: [":*"]
  github:
    mode: local
    read-only: true
    github-token: ${{ secrets.GITHUB_TOKEN }}
    toolsets: [all, dependabot]

network:
  allowed: [github]
  allowed-input: true

runtimes:
  node:
    version: "lts/*"

pre-agent-steps:
  - name: Check out trusted root instructions
    uses: actions/checkout@v7
    with:
      ref: ${{ github.event.pull_request.base.sha }}
      persist-credentials: false
  - name: Check out the exact consumer base
    uses: actions/checkout@v7
    with:
      repository: ${{ github.repository }}
      ref: ${{ github.event.pull_request.base.sha }}
      path: consumer
      fetch-depth: 0
      persist-credentials: false
  - name: Check out workflow implementation
    uses: actions/checkout@v7
    with:
      repository: ${{ job.workflow_repository }}
      ref: ${{ job.workflow_sha }}
      path: workflow
      persist-credentials: false
  - name: Install compatible Copilot CLI for the custom launcher
    env:
      GH_AW_COMPILED_VERSION: v1.2.2
      # `max` reasoning effort requires Copilot CLI 1.0.60 or newer.
      GH_AW_COPILOT_MIN_VERSION: 1.0.60
    run: |
      bash "${RUNNER_TEMP}/gh-aw/actions/install_copilot_cli.sh"
      mkdir -p "${RUNNER_TEMP}/gh-aw/bin"
      install -m 755 "$(command -v copilot)" "${RUNNER_TEMP}/gh-aw/bin/copilot"
  - name: Prepare trusted review evidence
    env:
      GITHUB_TOKEN: ${{ github.token }}
      AI_REVIEW_MODEL: ${{ inputs.model }}
      AI_REVIEW_REASONING_EFFORT: ${{ inputs.reasoning-effort }}
      AI_REVIEW_PROMPT_PATH: ${{ inputs.review-prompt-path }}
      AI_REVIEW_BASE_SHA: ${{ github.event.pull_request.base.sha }}
      AI_REVIEW_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
      AI_REVIEW_PR_NUMBER: ${{ github.event.pull_request.number }}
    run: node workflow/scripts/prepare-review.ts --repository-root consumer
  - name: Install latest review plugins
    env:
      COPILOT_GITHUB_TOKEN: ${{ github.token }}
    run: |
      copilot plugin marketplace add Soulike/knowledge-base
      copilot plugin marketplace add GoogleChrome/modern-web-guidance
      copilot plugin marketplace add mattpocock/skills
      copilot plugin install knowledge-base@knowledge-base
      copilot plugin install modern-web-guidance@googlechrome
      copilot plugin install mattpocock-skills@mattpocock
      copilot plugin list
  - name: Remove and verify Git credentials
    run: |
      bash "${RUNNER_TEMP}/gh-aw/actions/clean_git_credentials.sh"
      bash workflow/scripts/verify-git-credentials-removed.sh "$GITHUB_WORKSPACE"

safe-outputs:
  jobs:
    record-review-verdict:
      description: Record the completed review verdict separately from review prose. Call exactly once.
      runs-on: ubuntu-latest
      permissions:
        contents: read
      inputs:
        verdict:
          description: Use needs-change if any high or medium finding exists; otherwise approved.
          required: true
          type: choice
          options: [approved, needs-change]
      steps:
        - name: Check out result implementation
          uses: actions/checkout@v7
          with:
            repository: ${{ job.workflow_repository }}
            ref: ${{ job.workflow_sha }}
            persist-credentials: false
        - uses: actions/setup-node@v7
          with:
            node-version: "lts/*"
        - name: Validate and write structured result
          run: node scripts/write-review-result.ts "$GH_AW_AGENT_OUTPUT" /tmp/review-result.json
        - name: Retain structured result
          uses: actions/upload-artifact@v7
          with:
            name: ${{ needs.agent.outputs.artifact_prefix }}review-result
            path: /tmp/review-result.json
            retention-days: 30
            overwrite: true
            if-no-files-found: error
  github-token: ${{ secrets.GITHUB_TOKEN }}
  report-failure-as-issue: false
  report-failed-jobs: false
  create-pull-request-review-comment:
    max: 100
    side: RIGHT
    commit-id: ${{ github.event.pull_request.head.sha }}
  submit-pull-request-review:
    max: 1
    allowed-events: [COMMENT]
    commit-id: ${{ github.event.pull_request.head.sha }}
    footer: always
  report-missing-tool:
    create-issue: false
  report-missing-data:
    create-issue: false
  noop:
    report-as-issue: false
  report-incomplete:
    create-issue: false
  threat-detection:
    continue-on-error: false

jobs:
  prepare:
    name: Prepare review
    needs: []
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      reasoning-effort: ${{ steps.inputs.outputs.reasoning-effort }}
    steps:
      - uses: actions/checkout@v7
        with:
          repository: ${{ job.workflow_repository }}
          ref: ${{ job.workflow_sha }}
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: "lts/*"
      - name: Validate reasoning effort
        id: inputs
        env:
          AI_REVIEW_REASONING_EFFORT: ${{ inputs.reasoning-effort }}
        run: node scripts/resolve-inputs.ts
      - name: Validate supported event and required configuration
        env:
          AI_REVIEW_EVENT_NAME: ${{ github.event_name }}
          AI_REVIEW_REASONING_EFFORT: ${{ inputs.reasoning-effort }}
        run: |
          test "$AI_REVIEW_EVENT_NAME" = pull_request_target
          test -n "$AI_REVIEW_REASONING_EFFORT"
  activation:
    needs: [prepare]
  agent:
    needs: [prepare]
    if: "github.event_name == 'pull_request_target' && !github.event.pull_request.draft && github.event.action != 'converted_to_draft'"
  detection:
    needs: [prepare]

  safe_outputs:
    needs: [prepare, record_review_verdict]
    if: needs.agent.result == 'success' && needs.record_review_verdict.result == 'success'

  ai_review_validate:
    name: Validate AI review verdict
    if: always()
    needs: [prepare, agent, safe_outputs, record_review_verdict]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Check out gate implementation
        uses: actions/checkout@v7
        with:
          repository: ${{ job.workflow_repository }}
          ref: ${{ job.workflow_sha }}
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: "lts/*"
      - name: Download structured result
        if: needs.record_review_verdict.result == 'success'
        uses: actions/download-artifact@v8
        with:
          name: ${{ needs.agent.outputs.artifact_prefix }}review-result
          path: /tmp/review-result
      - name: Enforce structured verdict
        env:
          AI_REVIEW_PREPARE_RESULT: ${{ needs.prepare.result }}
          AI_REVIEW_AGENT_RESULT: ${{ needs.agent.result }}
          AI_REVIEW_SAFE_OUTPUTS_RESULT: ${{ needs.safe_outputs.result }}
          AI_REVIEW_VERDICT_RESULT: ${{ needs.record_review_verdict.result }}
          AI_REVIEW_PUBLICATION_STATUS: ${{ needs.safe_outputs.outputs.process_safe_outputs_status }}
          AI_REVIEW_PUBLICATION_ITEMS_APPLIED: ${{ needs.safe_outputs.outputs.process_safe_outputs_items_applied }}
        run: node scripts/review-gate.ts /tmp/review-result/review-result.json

  ai_review_gate:
    name: AI review gate
    detection-gate: status-only
    if: always()
    needs:
      [
        prepare,
        agent,
        detection,
        safe_outputs,
        record_review_verdict,
        ai_review_validate,
      ]
    runs-on: ubuntu-latest
    permissions: {}
    steps:
      - name: Require completed review stages
        env:
          PREPARE_RESULT: ${{ needs.prepare.result }}
          AGENT_RESULT: ${{ needs.agent.result }}
          DETECTION_RESULT: ${{ needs.detection.result }}
          PUBLICATION_RESULT: ${{ needs.safe_outputs.result }}
          VERDICT_RESULT: ${{ needs.record_review_verdict.result }}
          VALIDATION_RESULT: ${{ needs.ai_review_validate.result }}
        run: |
          failed=0
          for stage_result in "prepare:$PREPARE_RESULT" "agent:$AGENT_RESULT" "detection:$DETECTION_RESULT" "safe_outputs:$PUBLICATION_RESULT" "record_review_verdict:$VERDICT_RESULT" "ai_review_validate:$VALIDATION_RESULT"; do
            stage="${stage_result%%:*}"
            result="${stage_result#*:}"
            if [ "$result" != success ]; then
              printf '%s did not succeed (%s).\n' "$stage" "${result:-missing}" >&2
              failed=1
            fi
          done
          exit "$failed"
---
