import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
import { runInNewContext } from "node:vm";
import { isSeq, parseDocument } from "yaml";
import { parsePublicationIdentity } from "./review-state.ts";

const root = new URL("../", import.meta.url);
const compiledText = await readFile(
  new URL(".github/workflows/review.lock.yml", root),
  "utf8",
);
const compiled = parseDocument(compiledText);
const caller = parseDocument(
  await readFile(new URL(".github/workflows/review-pr.yml", root), "utf8"),
);

test("the documented caller matches the executable self-consumer", async () => {
  const guide = await readFile(new URL("docs/consumer-setup.md", root), "utf8");
  const example = /```yaml\n([\s\S]*?)\n```/u.exec(guide)?.[1];
  assert.ok(example);
  assert.deepEqual(parseDocument(example).toJSON(), caller.toJSON());
});

test("the guard script rejects earlier preparation attempts", async () => {
  const steps = compiled.getIn(["jobs", "publication_guard", "steps"]);
  assert.ok(isSeq(steps));
  const index = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "publication_guard", "steps", i, "name"]) ===
      "Require a fresh full workflow attempt",
  );
  assert.ok(index >= 0);
  const run = compiled.getIn([
    "jobs",
    "publication_guard",
    "steps",
    index,
    "run",
  ]);
  assert.ok(typeof run === "string");
  await promisify(execFile)("bash", ["-c", run], {
    env: { GITHUB_RUN_ATTEMPT: "2", AI_REVIEW_PREPARE_ATTEMPT: "2" },
  });
  await assert.rejects(
    promisify(execFile)("bash", ["-c", run], {
      env: { GITHUB_RUN_ATTEMPT: "3", AI_REVIEW_PREPARE_ATTEMPT: "2" },
    }),
  );
});

test("the publisher script emits a gate-readable identity", () => {
  const steps = compiled.getIn(["jobs", "safe_outputs", "steps"]);
  assert.ok(isSeq(steps));
  const stepNames = steps.items.map((_, i) =>
    compiled.getIn(["jobs", "safe_outputs", "steps", i, "name"]),
  );
  const binding = stepNames.indexOf(
    "Bind publication to this job and invocation",
  );
  assert.ok(binding >= 0);
  const bindingScript = compiled.getIn([
    "jobs",
    "safe_outputs",
    "steps",
    binding,
    "with",
    "script",
  ]);
  assert.ok(typeof bindingScript === "string");
  const exported = new Map<string, string>();
  runInNewContext(bindingScript, {
    process: {
      env: {
        AI_REVIEW_CALL_ID: "66",
        AI_REVIEW_CHECK_RUN_ID: "77",
        AI_REVIEW_IMPLEMENTATION_SHA: "c".repeat(40),
        GITHUB_RUN_ATTEMPT: "2",
      },
    },
    core: {
      exportVariable: (name: string, value: string) =>
        exported.set(name, value),
    },
  });
  const messages: unknown = JSON.parse(
    exported.get("GH_AW_SAFE_OUTPUT_MESSAGES") ?? "null",
  );
  assert.ok(
    messages &&
      typeof messages === "object" &&
      "footer" in messages &&
      typeof messages.footer === "string",
  );
  assert.deepEqual(parsePublicationIdentity(messages.footer), {
    callId: 66,
    checkRunId: 77,
    implementationSha: "c".repeat(40),
    runAttempt: 2,
  });
});

test("installation stages the binary used by the launcher and preserves arguments", async (t) => {
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
    'test "$1" = "1.2.3"\n',
  );
  const steps = compiled.getIn(["jobs", "agent", "steps"]);
  assert.ok(isSeq(steps));
  const installationIndex = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Install selected Copilot CLI for the custom launcher",
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
    ENGINE_VERSION: "1.2.3",
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
