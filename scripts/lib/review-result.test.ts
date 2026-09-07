import assert from "node:assert/strict";
import test from "node:test";
import { resultFromSafeOutputs, readReviewResult } from "./review-result.ts";

const review = {
  type: "submit_pull_request_review",
  event: "COMMENT",
  body: "A readable review.",
};
const verdict = { type: "record_review_verdict", verdict: "approved" };

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

test("rejects missing, duplicate, incomplete and failed safe-output streams", () => {
  for (const output of [
    null,
    {},
    { items: [] },
    { items: [review] },
    { items: [verdict] },
    { items: [review, verdict, verdict] },
    { items: [review, review, verdict] },
    { items: [review, { ...verdict, verdict: "unknown" }] },
    { items: [review, { type: "record_review_verdict" }] },
    { items: [{ ...review, event: "APPROVE" }, verdict] },
    { items: [review, verdict], errors: ["tool failed"] },
    { items: [review, verdict], errors: "malformed" },
    ...[
      "report_incomplete",
      "missing_data",
      "missing_tool",
      "noop",
      "add_comment",
    ].map((type) => ({ items: [review, verdict, { type }] })),
    { items: [null, review, verdict] },
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
