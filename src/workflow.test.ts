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
import { isSeq, parseDocument } from "yaml";

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
