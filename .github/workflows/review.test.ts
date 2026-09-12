import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { Document, isMap, isScalar, isSeq, parseDocument } from "yaml";

const root = new URL("../../", import.meta.url);
const compiledText = await readFile(
  new URL(".github/workflows/review.lock.yml", root),
  "utf8",
);
const compiled = parseDocument(compiledText);

test("gate rejects skipped publication through the compiled output and environment wiring", async (t) => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "review-publication-"),
  );
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifact = path.join(temporary, "review-result.json");
  await writeFile(artifact, JSON.stringify({ verdict: "approved" }));
  const gateSteps = compiled.getIn(["jobs", "ai_review_gate", "steps"]);
  assert.ok(isSeq(gateSteps));
  const gateIndex = gateSteps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "ai_review_gate", "steps", i, "name"]) ===
      "Enforce structured verdict",
  );
  assert.ok(gateIndex >= 0);

  function resolveMapping(mapping: unknown, context: Document) {
    assert.ok(isMap(mapping));
    return Object.fromEntries(
      mapping.items.map(({ key, value }) => {
        assert.ok(isScalar(key) && typeof key.value === "string");
        assert.ok(isScalar(value) && typeof value.value === "string");
        const reference = /^\$\{\{\s*([\w.]+)\s*\}\}$/u.exec(value.value)?.[1];
        assert.ok(reference, `Unsupported fixture expression: ${value.value}`);
        const resolved = context.getIn(reference.split(".")) ?? "";
        assert.ok(typeof resolved === "string");
        return [key.value, resolved];
      }),
    );
  }

  for (const [status, applied, exitCode] of [
    ["success", "1", 0],
    ["completed_with_skips", "0", 1],
    ["completed_with_skips", "1", 1],
    ["success", "0", 1],
  ] as const) {
    const outputs = resolveMapping(
      compiled.getIn(["jobs", "safe_outputs", "outputs"]),
      new Document({
        steps: {
          process_safe_outputs: { outputs: { status, items_applied: applied } },
        },
      }),
    );
    const env = resolveMapping(
      compiled.getIn(["jobs", "ai_review_gate", "steps", gateIndex, "env"]),
      new Document({
        needs: {
          prepare: { result: "success" },
          agent: { result: "success" },
          record_review_verdict: { result: "success" },
          safe_outputs: { result: "success", outputs },
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [new URL("scripts/review-gate.ts", root).pathname, artifact],
      { encoding: "utf8", env },
    );
    assert.equal(
      result.status,
      exitCode,
      `${status}, applied=${applied}: ${result.stdout}${result.stderr}`,
    );
    assert.match(
      result.stdout + result.stderr,
      exitCode === 0
        ? /AI review approved/u
        : /Required review was not published/u,
    );
  }
});

test("compatible installation stages the binary used by the launcher and preserves arguments", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "review-launcher-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const binaryDir = path.join(temporary, "downloaded");
  await mkdir(binaryDir, { recursive: true });
  const fakeBinary = path.join(binaryDir, "copilot");
  await writeFile(fakeBinary, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
  await chmod(fakeBinary, 0o755);
  const actionsDir = path.join(temporary, "gh-aw/actions");
  await mkdir(actionsDir, { recursive: true });
  await writeFile(
    path.join(actionsDir, "install_copilot_cli.sh"),
    'test "$#" = 0\ntest "$GH_AW_COMPILED_VERSION" = "v0.88.7"\n',
  );
  const steps = compiled.getIn(["jobs", "agent", "steps"]);
  assert.ok(isSeq(steps));
  const installationIndex = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Install compatible Copilot CLI for the custom launcher",
  );
  assert.ok(installationIndex >= 0);
  const installation = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    installationIndex,
    "run",
  ]);
  assert.ok(typeof installation === "string");
  const executionIndex = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "id"]) ===
      "agentic_execution",
  );
  const execution = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    executionIndex,
    "run",
  ]);
  assert.ok(typeof execution === "string");
  const command =
    /<<'GH_AW_ENGINE_COMMAND_EOF'\n([\s\S]*?)\nGH_AW_ENGINE_COMMAND_EOF/u.exec(
      execution,
    )?.[1];
  assert.ok(command);
  const env = {
    PATH: `${binaryDir}:${process.env.PATH}`,
    RUNNER_TEMP: temporary,
    GH_AW_COMPILED_VERSION: "v0.88.7",
    AI_REVIEW_REASONING_EFFORT: "xhigh",
  };
  await promisify(execFile)("bash", ["-eu", "-c", installation], { env });
  const { stdout } = await promisify(execFile)(
    "bash",
    ["-c", command, "launcher", "--model", "model with spaces"],
    { env },
  );
  assert.equal(
    stdout,
    "--reasoning-effort\nxhigh\n--model\nmodel with spaces\n",
  );
  await assert.rejects(
    promisify(execFile)("bash", ["-c", command], {
      env: { ...env, AI_REVIEW_REASONING_EFFORT: "" },
    }),
    /reasoning effort is required/u,
  );
});
