import assert from "node:assert/strict";
import test from "node:test";
import { assertCompletePublication } from "./publication.ts";

test("requires exactly one completed review and no incomplete or unrelated effects", () => {
  const submit = {
    type: "submit_pull_request_review",
    body: "Completed",
    event: "COMMENT",
  };
  assert.doesNotThrow(() => assertCompletePublication({ items: [submit] }));
  assert.doesNotThrow(() =>
    assertCompletePublication({
      items: [{ type: "create_pull_request_review_comment" }, submit],
    }),
  );
  for (const output of [
    null,
    {},
    { items: [] },
    { items: [submit, submit] },
    { items: [{ type: "create_pull_request_review_comment" }] },
    {
      items: [
        { type: "report_incomplete", reason: "missing evidence" },
        submit,
      ],
    },
    { items: [submit, { type: "missing_data" }] },
    { items: [{ type: "noop" }] },
    { items: [null] },
  ])
    assert.throws(() => assertCompletePublication(output), /complete review/u);
});
