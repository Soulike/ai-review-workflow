import assert from "node:assert/strict";
import test from "node:test";
import { resultFromSafeOutputs, readReviewResult } from "./review-result.ts";

const review = {
  type: "submit_pull_request_review",
  event: "COMMENT",
  body: "A readable review.",
};
const verdict = { type: "record_review_verdict", verdict: "approved" };
const missingTool = {
  type: "missing_tool",
  tool: "Direct registry metadata request via Bash",
  reason: "security",
  alternatives: "Use read-only advisory and package metadata sources.",
};

test("uses only the custom verdict, independent of review and inline prose", () => {
  for (const body of [
    "No Markdown fields",
    "**Verdict:** `needs-change`",
    "- **Verdict:** `approved`",
    "",
  ]) {
    for (const value of ["approved", "needs-change"] as const) {
      assert.deepEqual(
        resultFromSafeOutputs({
          items: [
            { ...review, body },
            {
              type: "create_pull_request_review_comment",
              body: "Unstructured finding text",
            },
            { ...verdict, verdict: value },
          ],
          errors: [],
        }),
        { verdict: value },
      );
    }
  }
});

test("ignores non-failing safe outputs when the review is complete", () => {
  for (const diagnostic of [
    missingTool,
    { type: "noop", message: "No additional action needed." },
    { type: "future_diagnostic", detail: "New non-failing output." },
  ]) {
    assert.deepEqual(
      resultFromSafeOutputs({
        items: [diagnostic, review, verdict],
        errors: [],
      }),
      { verdict: "approved" },
    );
  }
});

test("rejects missing, duplicate, incomplete and failed safe-output streams", () => {
  for (const output of [
    null,
    {},
    { items: [] },
    { items: [review] },
    { items: [verdict] },
    { items: [missingTool, review] },
    { items: [missingTool, verdict] },
    { items: [review, verdict, verdict] },
    { items: [review, review, verdict] },
    { items: [review, { ...verdict, verdict: "unknown" }] },
    { items: [review, { type: "record_review_verdict" }] },
    { items: [{ ...review, event: "APPROVE" }, verdict] },
    { items: [review, verdict], errors: ["tool failed"] },
    { items: [review, verdict], errors: "malformed" },
    ...["report_incomplete", "missing_data"].map((type) => ({
      items: [review, verdict, { type }],
    })),
    { items: [null, review, verdict] },
    { items: [{ type: 1 }, review, verdict] },
  ])
    assert.throws(() => resultFromSafeOutputs(output));
});

test("the result artifact requires a concrete structured verdict", () => {
  assert.deepEqual(readReviewResult({ verdict: "approved" }), {
    verdict: "approved",
  });
  for (const input of [
    null,
    [],
    {},
    "approved",
    { verdict: true },
    { verdict: "incomplete" },
  ]) {
    assert.throws(() => readReviewResult(input), /structured/u);
  }
});
