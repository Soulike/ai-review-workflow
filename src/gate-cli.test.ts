import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const gate = new URL("../scripts/review-gate.ts", import.meta.url);
const environment = {
  AI_REVIEW_BASE_SHA: "a".repeat(40),
  AI_REVIEW_HEAD_SHA: "b".repeat(40),
  AI_REVIEW_PR_NUMBER: "42",
  AI_REVIEW_PR_URL: "https://github.com/owner/consumer/pull/42",
  AI_REVIEW_REPOSITORY: "owner/consumer",
  GITHUB_RUN_ID: "1234",
  GITHUB_RUN_ATTEMPT: "2",
  AI_REVIEW_EVENT_ACTION: "converted_to_draft",
  AI_REVIEW_PR_DRAFT: "true",
  AI_REVIEW_AGENT_RESULT: "skipped",
  AI_REVIEW_SAFE_OUTPUTS_RESULT: "skipped",
};

test("gate explains draft and prerequisite failures without a token or fabricated verdict", () => {
  for (const [env, message] of [
    [environment, /draft pull request/u],
    [
      {
        ...environment,
        AI_REVIEW_EVENT_ACTION: "synchronize",
        AI_REVIEW_PR_DRAFT: "false",
        KESTREL_PREPARE_RESULT: "failure",
      },
      /PREPARE_RESULT did not succeed/u,
    ],
  ] as const) {
    const result = spawnSync(process.execPath, [gate.pathname], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, message);
  }
});
