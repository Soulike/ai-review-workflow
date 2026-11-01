import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const writer = new URL("./write-review-result.ts", import.meta.url);
const gate = new URL("./review-gate.ts", import.meta.url);
const prerequisites = {
  AI_REVIEW_PREPARE_RESULT: "success",
  AI_REVIEW_AGENT_RESULT: "success",
  AI_REVIEW_SAFE_OUTPUTS_RESULT: "success",
  AI_REVIEW_VERDICT_RESULT: "success",
};
const environment = {
  ...prerequisites,
  AI_REVIEW_PUBLICATION_STATUS: "success",
  AI_REVIEW_PUBLICATION_ITEMS_APPLIED: "1",
};

test("writes a safe-output result and reuses the artifact in the gate without GitHub credentials", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-result-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, "agent_output.json");
  const output = path.join(root, "review-result.json");
  for (const verdict of ["approved", "needs-change"] as const) {
    await writeFile(
      input,
      JSON.stringify({
        items: [
          {
            type: "submit_pull_request_review",
            event: "COMMENT",
            body: "**Verdict:** arbitrary prose",
          },
          { type: "record_review_verdict", verdict },
        ],
      }),
    );
    const written = spawnSync(
      process.execPath,
      [writer.pathname, input, output],
      { encoding: "utf8", env: {} },
    );
    assert.equal(written.status, 0, written.stderr);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), { verdict });
    for (const attempt of ["1", "2"]) {
      const result = spawnSync(process.execPath, [gate.pathname, output], {
        encoding: "utf8",
        env: { ...environment, GITHUB_RUN_ATTEMPT: attempt },
      });
      assert.equal(
        result.status,
        verdict === "approved" ? 0 : 1,
        result.stderr,
      );
      assert.match(
        result.stdout + result.stderr,
        verdict === "approved"
          ? /AI review approved/u
          : /AI review requires changes/u,
      );
    }
  }
  await writeFile(
    input,
    JSON.stringify({ items: [{ type: "report_incomplete" }] }),
  );
  const rejected = spawnSync(
    process.execPath,
    [writer.pathname, input, path.join(root, "absent.json")],
    { encoding: "utf8", env: {} },
  );
  assert.equal(rejected.status, 1);
  await assert.rejects(readFile(path.join(root, "absent.json")), {
    code: "ENOENT",
  });
});

test("gate fails on unsuccessful prerequisites or missing and malformed artifacts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "result.json");
  const run = (env: NodeJS.ProcessEnv = environment) =>
    spawnSync(process.execPath, [gate.pathname, file], {
      encoding: "utf8",
      env,
    });
  for (const name of Object.keys(prerequisites)) {
    for (const state of ["failure", "cancelled", "skipped", ""]) {
      const result = run({ ...environment, [name]: state });
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(name + " did not succeed"));
    }
  }
  assert.equal(run().status, 1);
  for (const body of ["{", "{}", '{"verdict":"unknown"}']) {
    await writeFile(file, body);
    assert.equal(run().status, 1);
  }
});

test("gate rejects missing or malformed publication evidence", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "review-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "result.json");
  await writeFile(file, JSON.stringify({ verdict: "approved" }));
  for (const [name, value] of [
    ["AI_REVIEW_PUBLICATION_STATUS", ""],
    ["AI_REVIEW_PUBLICATION_ITEMS_APPLIED", ""],
    ["AI_REVIEW_PUBLICATION_ITEMS_APPLIED", "not-a-count"],
  ] as const) {
    const result = spawnSync(process.execPath, [gate.pathname, file], {
      encoding: "utf8",
      env: { ...environment, [name]: value },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Required review was not published/u);
  }
});
