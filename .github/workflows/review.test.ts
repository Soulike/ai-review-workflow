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
import { compilerVersion } from "../../scripts/lib/compiler-contract.ts";

const root = new URL("../../", import.meta.url);
const maxReasoningEffortMinimumVersion = "1.0.60";
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
  const gateSteps = compiled.getIn(["jobs", "validate_review", "steps"]);
  assert.ok(isSeq(gateSteps));
  const gateIndex = gateSteps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "validate_review", "steps", i, "name"]) ===
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
      compiled.getIn(["jobs", "validate_review", "steps", gateIndex, "env"]),
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

test("required gate runs after detection and fails if review validation did not succeed", () => {
  const job = compiled.getIn(["jobs", "ai_review_gate"]);
  assert.ok(isMap(job));
  assert.equal(compiled.getIn(["jobs", "ai_review_gate", "if"]), "always()");
  const needs = compiled.getIn(["jobs", "ai_review_gate", "needs"]);
  assert.ok(isSeq(needs));
  assert.ok(
    needs.items.some(
      (item) => isScalar(item) && item.value === "validate_review",
    ),
  );
  assert.ok(
    needs.items.some((item) => isScalar(item) && item.value === "detection"),
  );
  const validationCondition = compiled.getIn(["jobs", "validate_review", "if"]);
  assert.ok(typeof validationCondition === "string");
  assert.match(validationCondition, /needs\.detection\.result == 'success'/u);
  assert.match(
    validationCondition,
    /needs\.detection\.outputs\.detection_success == 'true'/u,
  );
  const steps = compiled.getIn(["jobs", "ai_review_gate", "steps"]);
  assert.ok(isSeq(steps));
  const index = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "ai_review_gate", "steps", i, "name"]) ===
      "Require successful review validation",
  );
  assert.ok(index >= 0);
  assert.equal(
    compiled.getIn([
      "jobs",
      "ai_review_gate",
      "steps",
      index,
      "env",
      "AI_REVIEW_VALIDATION_RESULT",
    ]),
    "${{ needs.validate_review.result }}",
  );
  const run = compiled.getIn(["jobs", "ai_review_gate", "steps", index, "run"]);
  assert.ok(typeof run === "string");
  for (const result of ["success", "failure", "cancelled", "skipped", ""]) {
    const execution: { status: number | null } = spawnSync(
      "/bin/bash",
      ["-e", "-c", run],
      {
        encoding: "utf8",
        env: { AI_REVIEW_VALIDATION_RESULT: result },
      },
    );
    assert.equal(execution.status, result === "success" ? 0 : 1, result);
  }
});

test("compatible installation stages the launcher binary and preserves arguments", async (t) => {
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
    `set -eu\ntest "$#" = 0\ntest "$GH_AW_COMPILED_VERSION" = "${compilerVersion}"\ntest "$GH_AW_COPILOT_MIN_VERSION" = "${maxReasoningEffortMinimumVersion}"\n`,
  );
  const steps = compiled.getIn(["jobs", "agent", "steps"]);
  assert.ok(isSeq(steps));
  const installationIndices = steps.items.flatMap((_, i) => {
    const run = compiled.getIn(["jobs", "agent", "steps", i, "run"]);
    return typeof run === "string" && run.includes("install_copilot_cli.sh")
      ? [i]
      : [];
  });
  assert.equal(
    installationIndices.length,
    1,
    "expected exactly one Copilot installer in the agent job",
  );
  const installationIndex = installationIndices[0];
  assert.ok(installationIndex !== undefined);
  const installation = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    installationIndex,
    "run",
  ]);
  assert.ok(typeof installation === "string");
  const compiledVersion = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    installationIndex,
    "env",
    "GH_AW_COMPILED_VERSION",
  ]);
  assert.ok(typeof compiledVersion === "string");
  assert.equal(compiledVersion, compilerVersion);
  const minimumVersion = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    installationIndex,
    "env",
    "GH_AW_COPILOT_MIN_VERSION",
  ]);
  assert.ok(typeof minimumVersion === "string");
  assert.equal(minimumVersion, maxReasoningEffortMinimumVersion);
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
    AI_REVIEW_REASONING_EFFORT: "xhigh",
    GH_AW_COMPILED_VERSION: compiledVersion,
    GH_AW_COPILOT_MIN_VERSION: minimumVersion,
  };
  await promisify(execFile)("bash", ["-eu", "-c", installation], { env });
  await rm(fakeBinary);
  const executionEnv = {
    ...env,
    PATH: path.join(temporary, "empty-path"),
  };
  const { stdout } = await promisify(execFile)(
    "/bin/bash",
    ["-c", command, "launcher", "--model", "model with spaces"],
    { env: executionEnv },
  );
  assert.equal(
    stdout,
    "--reasoning-effort\nxhigh\n--model\nmodel with spaces\n",
  );
  await assert.rejects(
    promisify(execFile)("/bin/bash", ["-c", command], {
      env: { ...executionEnv, AI_REVIEW_REASONING_EFFORT: "" },
    }),
    /reasoning effort is required/u,
  );
});
