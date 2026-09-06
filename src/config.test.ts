import assert from "node:assert/strict";
import test from "node:test";
import { readReviewConfig } from "./config.ts";

const environment = {
  AI_REVIEW_BASE_SHA: "a".repeat(40),
  AI_REVIEW_HEAD_SHA: "b".repeat(40),
  AI_REVIEW_PR_NUMBER: "42",
};

test("decodes the fixed event revisions used to prepare Git evidence", () => {
  assert.deepEqual(readReviewConfig(environment), {
    baseSha: "a".repeat(40),
    expectedHeadSha: "b".repeat(40),
    prNumber: 42,
  });
  for (const [field, values] of [
    ["AI_REVIEW_BASE_SHA", ["", "a".repeat(39)]],
    ["AI_REVIEW_HEAD_SHA", ["$(git push)", "B".repeat(40)]],
    ["AI_REVIEW_PR_NUMBER", ["", "0", "42; echo unsafe", "9007199254740992"]],
  ] as const) {
    for (const value of values)
      assert.throws(() => readReviewConfig({ ...environment, [field]: value }));
  }
});
