import assert from "node:assert/strict";
import { execFile, spawnSync, type SpawnSyncReturns } from "node:child_process";
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

function resolveMapping(
  mapping: unknown,
  context: Document,
): Record<string, string> {
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

test("inner completion command rejects every unsuccessful mandatory review stage", () => {
  const jobs = [
    "prepare",
    "agent",
    "detection",
    "safe_outputs",
    "record_review_verdict",
    "ai_review_validate",
  ];
  const needs = Object.fromEntries(
    jobs.map((job) => [job, { result: "success" }]),
  );
  const steps = compiled.getIn(["jobs", "ai_review_gate", "steps"]);
  assert.ok(isSeq(steps));
  const step = steps.items.find(
    (item) =>
      isMap(item) && item.get("name") === "Require completed review stages",
  );
  assert.ok(isMap(step));
  const command = step.get("run");
  assert.ok(typeof command === "string");
  const run = (context: Document) =>
    spawnSync("/bin/bash", ["-e", "-o", "pipefail", "-c", command], {
      encoding: "utf8",
      env: resolveMapping(step.get("env"), context),
    });
  assert.equal(run(new Document({ needs })).status, 0);
  for (const job of jobs) {
    for (const result of ["failure", "cancelled", "skipped", ""]) {
      const rejected = run(
        new Document({ needs: { ...needs, [job]: { result } } }),
      );
      assert.equal(rejected.status, 1, `${job}=${result}`);
      assert.ok(rejected.stderr.includes(job), rejected.stderr);
    }
    assert.equal(
      run(new Document({ needs: { ...needs, [job]: {} } })).status,
      1,
      `missing ${job} result`,
    );
  }
});

test("outer gate command requires successful completion of the entire Engine", async () => {
  const wrapper = parseDocument(
    await readFile(new URL(".github/workflows/ai-review.yml", root), "utf8"),
  );
  const step = wrapper.getIn(["jobs", "ai_review_gate", "steps", 0]);
  assert.ok(isMap(step));
  const command = step.get("run");
  assert.ok(typeof command === "string");
  for (const [result, exitCode] of [
    ["success", 0],
    ["failure", 1],
    ["cancelled", 1],
    ["skipped", 1],
    ["", 1],
  ] as const) {
    const outcome: SpawnSyncReturns<string> = spawnSync(
      "/bin/bash",
      ["-e", "-c", command],
      {
        encoding: "utf8",
        env: resolveMapping(
          step.get("env"),
          new Document({ needs: { engine: { result } } }),
        ),
      },
    );
    assert.equal(outcome.status, exitCode, result);
    if (exitCode !== 0) {
      assert.match(outcome.stderr, /Engine/u);
    }
  }
});

test("gate rejects skipped publication through the compiled output and environment wiring", async (t) => {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "review-publication-"),
  );
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const artifact = path.join(temporary, "review-result.json");
  await writeFile(artifact, JSON.stringify({ verdict: "approved" }));
  const gateSteps = compiled.getIn(["jobs", "ai_review_validate", "steps"]);
  assert.ok(isSeq(gateSteps));
  const gateIndex = gateSteps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "ai_review_validate", "steps", i, "name"]) ===
      "Enforce structured verdict",
  );
  assert.ok(gateIndex >= 0);

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
      compiled.getIn(["jobs", "ai_review_validate", "steps", gateIndex, "env"]),
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
