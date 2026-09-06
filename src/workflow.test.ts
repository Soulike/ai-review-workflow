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
import { isMap, isSeq, parseDocument } from "yaml";

const root = new URL("../", import.meta.url);
const compiledText = await readFile(
  new URL(".github/workflows/review.lock.yml", root),
  "utf8",
);
const compiled = parseDocument(compiledText);
const publicWorkflow = parseDocument(
  await readFile(new URL(".github/workflows/ai-review.yml", root), "utf8"),
);
const caller = parseDocument(
  await readFile(new URL(".github/workflows/review-pr.yml", root), "utf8"),
);
const sourceText = await readFile(
  new URL(".github/workflows/review.md", root),
  "utf8",
);
const source = parseDocument(sourceText.split("\n---\n")[0]?.slice(4) ?? "");

test("the documented caller matches the executable self-consumer", async () => {
  const guide = await readFile(new URL("docs/consumer-setup.md", root), "utf8");
  const example = /```yaml\n([\s\S]*?)\n```/u.exec(guide)?.[1];
  assert.ok(example);
  assert.deepEqual(parseDocument(example).toJSON(), caller.toJSON());
});

test("the self-consumer forwards repository reasoning effort without a fallback", () => {
  assert.equal(
    caller.getIn(["jobs", "review", "with", "reasoning-effort"]),
    "${{ vars.AI_REVIEW_REASONING_EFFORT }}",
  );
  assert.equal(
    publicWorkflow.getIn(["jobs", "engine", "with", "reasoning-effort"]),
    "${{ inputs.reasoning-effort }}",
  );
  assert.equal(
    compiled.getIn(["env", "KESTREL_REASONING_EFFORT"]),
    "${{ inputs.reasoning-effort }}",
  );
});

test("the public interface forwards only the three settings and Tavily secret to its same-revision engine", () => {
  const inputs = publicWorkflow.getIn(["on", "workflow_call", "inputs"]);
  assert.ok(isMap(inputs));
  assert.deepEqual(inputs.items.map((pair) => String(pair.key)).sort(), [
    "model",
    "reasoning-effort",
    "review-prompt-path",
  ]);
  for (const name of ["model", "reasoning-effort", "review-prompt-path"]) {
    for (const field of ["type", "required", "default"]) {
      assert.equal(
        publicWorkflow.getIn(["on", "workflow_call", "inputs", name, field]),
        source.getIn(["on", "workflow_call", "inputs", name, field]),
      );
    }
  }
  assert.equal(
    publicWorkflow.getIn(["jobs", "engine", "uses"]),
    "./.github/workflows/review.lock.yml",
  );
  assert.equal(
    publicWorkflow.getIn(["on", "workflow_call", "outputs"]),
    undefined,
  );
  assert.equal(
    publicWorkflow.getIn(["jobs", "engine", "secrets", "TAVILY_API_KEY"]),
    "${{ secrets.TAVILY_API_KEY }}",
  );
  assert.equal(
    publicWorkflow.getIn(["jobs", "engine", "secrets", "GH_AW_GITHUB_TOKEN"]),
    undefined,
  );
  assert.equal(
    caller.getIn(["jobs", "review", "uses"]),
    "Soulike/kestrel/.github/workflows/ai-review.yml@main",
  );
  assert.equal(caller.getIn(["concurrency", "cancel-in-progress"]), true);
  assert.notEqual(
    compiled.getIn(["concurrency", "group"]),
    caller.getIn(["concurrency", "group"]),
  );
  assert.notEqual(compiled.getIn(["concurrency", "cancel-in-progress"]), true);
});

test("a guard-only rerun cannot republish earlier successful inference", async () => {
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
  assert.equal(
    compiled.getIn(["jobs", "prepare", "outputs", "run-attempt"]),
    "${{ github.run_attempt }}",
  );
  assert.equal(
    compiled.getIn([
      "jobs",
      "publication_guard",
      "steps",
      index,
      "env",
      "KESTREL_PREPARE_ATTEMPT",
    ]),
    "${{ needs.prepare.outputs.run-attempt }}",
  );
  await promisify(execFile)("bash", ["-c", run], {
    env: { GITHUB_RUN_ATTEMPT: "2", KESTREL_PREPARE_ATTEMPT: "2" },
  });
  await assert.rejects(
    promisify(execFile)("bash", ["-c", run], {
      env: { GITHUB_RUN_ATTEMPT: "3", KESTREL_PREPARE_ATTEMPT: "2" },
    }),
  );
});

test("publisher authentication is bound in a trusted pre-step before the handler", () => {
  const steps = compiled.getIn(["jobs", "safe_outputs", "steps"]);
  assert.ok(isSeq(steps));
  const stepNames = steps.items.map((_, i) =>
    compiled.getIn(["jobs", "safe_outputs", "steps", i, "name"]),
  );
  const binding = stepNames.indexOf(
    "Bind publication to this job and invocation",
  );
  const handler = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "safe_outputs", "steps", i, "id"]) ===
      "process_safe_outputs",
  );
  assert.ok(binding >= 0 && handler > binding);
  assert.equal(
    compiled.getIn([
      "jobs",
      "safe_outputs",
      "steps",
      binding,
      "env",
      "KESTREL_CHECK_ID",
    ]),
    "${{ job.check_run_id }}",
  );
  assert.equal(
    compiled.getIn([
      "jobs",
      "safe_outputs",
      "steps",
      binding,
      "env",
      "KESTREL_CALL_ID",
    ]),
    "${{ needs.publication_guard.outputs.call-id }}",
  );
  assert.equal(
    compiled.getIn(["jobs", "safe_outputs", "permissions", "issues"]),
    undefined,
  );
  assert.equal(
    compiled.getIn(["jobs", "conclusion", "permissions", "issues"]),
    undefined,
  );
  assert.equal(compiled.getIn(["jobs", "ai_review_gate", "if"]), "always()");
  assert.match(
    String(compiled.getIn(["jobs", "agent", "if"])),
    /!github.event.pull_request.draft/u,
  );
});

test("candidate CI and reviewer execute different trees, both on selected Node LTS", async () => {
  const ci = parseDocument(
    await readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
  );
  assert.ok(ci.hasIn(["on", "pull_request"]));
  assert.equal(ci.getIn(["permissions", "contents"]), "read");
  assert.equal(ci.getIn(["permissions", "pull-requests"]), undefined);
  assert.equal(source.getIn(["runtimes", "node", "version"]), "lts/*");
  assert.equal(source.getIn(["checkout"]), false);
  assert.doesNotMatch(compiledText, /checkout_pr_branch\.cjs/u);
  assert.doesNotMatch(compiledText, /--exclude-env KESTREL_REASONING_EFFORT/u);
  const steps = compiled.getIn(["jobs", "agent", "steps"]);
  assert.ok(isSeq(steps));
  const consumer = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Check out the exact consumer base",
  );
  const assets = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Check out the invoked Kestrel assets",
  );
  assert.ok(consumer >= 0 && assets >= 0);
  assert.equal(
    compiled.getIn(["jobs", "agent", "steps", consumer, "with", "ref"]),
    "${{ github.event.pull_request.base.sha }}",
  );
  assert.equal(
    compiled.getIn(["jobs", "agent", "steps", assets, "with", "ref"]),
    "${{ job.workflow_sha }}",
  );
  assert.equal(
    compiled.getIn(["jobs", "agent", "steps", assets, "with", "repository"]),
    "${{ job.workflow_repository }}",
  );
  const install = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Install only Kestrel implementation dependencies",
  );
  assert.ok(install >= 0);
  assert.equal(
    compiled.getIn(["jobs", "agent", "steps", install, "working-directory"]),
    "kestrel",
  );
  assert.match(
    String(compiled.getIn(["jobs", "agent", "steps", install, "run"])),
    /pnpm install --frozen-lockfile --ignore-scripts/u,
  );
  assert.doesNotMatch(sourceText, /author_association|pnpm test|pnpm check/u);
});

test("compiled installation stages the CLI before its launcher forwards effort and arguments", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "kestrel-launcher-"));
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
  const preparationIndex = steps.items.findIndex(
    (_, i) =>
      compiled.getIn(["jobs", "agent", "steps", i, "name"]) ===
      "Prepare trusted review evidence",
  );
  assert.ok(installationIndex >= 0 && installationIndex < preparationIndex);
  const installation = compiled.getIn([
    "jobs",
    "agent",
    "steps",
    installationIndex,
    "run",
  ]);
  assert.ok(typeof installation === "string");
  assert.equal(
    compiled.getIn([
      "jobs",
      "agent",
      "steps",
      installationIndex,
      "env",
      "ENGINE_VERSION",
    ]),
    "${{ needs.prepare.outputs.copilot-version }}",
  );
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
    KESTREL_REASONING_EFFORT: "xhigh",
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
      env: { ...env, KESTREL_REASONING_EFFORT: "" },
    }),
    /reasoning effort is required/u,
  );
});
