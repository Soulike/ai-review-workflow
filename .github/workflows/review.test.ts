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
import { VFile } from "vfile";
import { matter } from "vfile-matter";
import { Document, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { compilerVersion } from "../../scripts/lib/compiler-contract.ts";

const root = new URL("../../", import.meta.url);
const maxReasoningEffortMinimumVersion = "1.0.60";
const compiledWorkflows = [
  ".github/workflows/review-deepseek-web-mcp.lock.yml",
  ".github/workflows/review-tavily-mcp.lock.yml",
] as const;

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

const allowedFrontmatterDifferences = [
  ["name"],
  ["on", "workflow_call", "secrets"],
  ["mcp-servers"],
  ["network", "allowed"],
] as const;

function parseEntryWorkflow(markdown: string): {
  frontmatter: Document;
  body: string;
} {
  const file = new VFile(markdown);
  matter(file, { strip: true });
  assert.ok(
    file.data.matter && Object.keys(file.data.matter).length > 0,
    "Expected YAML frontmatter",
  );
  return {
    frontmatter: new Document(file.data.matter),
    body: String(file),
  };
}

test("entry workflows differ only in expected backend-specific configuration", async () => {
  const deepseek = parseEntryWorkflow(
    await readFile(
      new URL(".github/workflows/review-deepseek-web-mcp.md", root),
      "utf8",
    ),
  );
  const tavily = parseEntryWorkflow(
    await readFile(
      new URL(".github/workflows/review-tavily-mcp.md", root),
      "utf8",
    ),
  );
  for (const fieldPath of allowedFrontmatterDifferences) {
    assert.ok(
      deepseek.frontmatter.deleteIn(fieldPath),
      `Expected backend-specific field ${fieldPath.join(".")} in DeepSeek workflow`,
    );
    assert.ok(
      tavily.frontmatter.deleteIn(fieldPath),
      `Expected backend-specific field ${fieldPath.join(".")} in Tavily workflow`,
    );
  }
  assert.deepEqual(deepseek.frontmatter.toJS(), tavily.frontmatter.toJS());
  assert.equal(deepseek.body, tavily.body);
});

test("outer workflow wires select_search_mcp and ai_review_gate scripts with expected inputs", async (t) => {
  const wrapper = parseDocument(
    await readFile(new URL(".github/workflows/ai-review.yml", root), "utf8"),
  );
  const temporary = await mkdtemp(path.join(os.tmpdir(), "outer-workflow-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const selectSteps = wrapper.getIn(["jobs", "select_search_mcp", "steps"]);
  assert.ok(isSeq(selectSteps));
  const selectStep = selectSteps.items.find(
    (item) => isMap(item) && item.get("id") === "select",
  );
  assert.ok(isMap(selectStep));
  const selectCommand = selectStep.get("run");
  assert.ok(typeof selectCommand === "string");
  const githubOutput = path.join(temporary, "github-output");
  await writeFile(githubOutput, "");
  const selectOutcome = spawnSync("/bin/bash", ["-e", "-c", selectCommand], {
    cwd: root.pathname,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GITHUB_OUTPUT: githubOutput,
      ...resolveMapping(
        selectStep.get("env"),
        new Document({
          secrets: { DEEPSEEK_API_KEY: "ds-key", TAVILY_API_KEY: "tvly-key" },
        }),
      ),
    },
  });
  assert.equal(selectOutcome.status, 0, selectOutcome.stderr);
  assert.equal(await readFile(githubOutput, "utf8"), "mcp=deepseek-web\n");

  const gateSteps = wrapper.getIn(["jobs", "ai_review_gate", "steps"]);
  assert.ok(isSeq(gateSteps));
  const gateStep = gateSteps.items.find(
    (item) => isMap(item) && item.get("name") === "Require completed Engine",
  );
  assert.ok(isMap(gateStep));
  const gateCommand = gateStep.get("run");
  assert.ok(typeof gateCommand === "string");
  const runGate = (needs: Record<string, unknown>) =>
    spawnSync("/bin/bash", ["-e", "-c", gateCommand], {
      cwd: root.pathname,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        ...resolveMapping(gateStep.get("env"), new Document({ needs })),
      },
    });
  assert.equal(
    runGate({
      select_search_mcp: {
        result: "success",
        outputs: { mcp: "deepseek-web" },
      },
      engine_deepseek_web: { result: "success" },
      engine_tavily: { result: "skipped" },
    }).status,
    0,
  );
  assert.equal(
    runGate({
      select_search_mcp: {
        result: "success",
        outputs: { mcp: "tavily" },
      },
      engine_deepseek_web: { result: "skipped" },
      engine_tavily: { result: "failure" },
    }).status,
    1,
  );
});

for (const workflowFile of compiledWorkflows) {
  test(`${workflowFile}: inner completion command rejects every unsuccessful mandatory review stage`, async () => {
    const compiled = parseDocument(
      await readFile(new URL(workflowFile, root), "utf8"),
    );
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

  test(`${workflowFile}: gate rejects skipped publication through the compiled output and environment wiring`, async (t) => {
    const compiled = parseDocument(
      await readFile(new URL(workflowFile, root), "utf8"),
    );
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
            process_safe_outputs: {
              outputs: { status, items_applied: applied },
            },
          },
        }),
      );
      const env = resolveMapping(
        compiled.getIn([
          "jobs",
          "ai_review_validate",
          "steps",
          gateIndex,
          "env",
        ]),
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

  test(`${workflowFile}: compatible installation stages the launcher binary and preserves arguments`, async (t) => {
    const compiled = parseDocument(
      await readFile(new URL(workflowFile, root), "utf8"),
    );
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

  test(`${workflowFile}: inlines prompt content without runtime-import lookups`, async () => {
    const compiled = parseDocument(
      await readFile(new URL(workflowFile, root), "utf8"),
    );
    const steps = compiled.getIn(["jobs", "activation", "steps"]);
    assert.ok(isSeq(steps));
    const promptStep = steps.items.find(
      (item) =>
        isMap(item) &&
        item.get("name") === "Create prompt with built-in context",
    );
    assert.ok(
      isMap(promptStep),
      "expected Create prompt with built-in context step",
    );
    const env = promptStep.get("env");
    assert.ok(isMap(env));

    const promptChunks = env.items
      .filter(
        ({ key }) =>
          isScalar(key) &&
          typeof key.value === "string" &&
          key.value.startsWith("GH_AW_PROMPT_CONTENT_"),
      )
      .map(({ key, value }) => {
        assert.ok(isScalar(key) && typeof key.value === "string");
        assert.ok(isScalar(value) && typeof value.value === "string");
        return [key.value, value.value] as const;
      });
    assert.ok(
      promptChunks.length > 0,
      "expected GH_AW_PROMPT_CONTENT_* entries",
    );

    for (const [key, value] of promptChunks) {
      assert.doesNotMatch(
        value,
        /\{\{#(?:runtime-import|import)\b/u,
        `${key} must not contain runtime import directives for cross-repo callers`,
      );
    }

    const combinedPrompt = promptChunks.map(([, value]) => value).join("\n");
    assert.match(combinedPrompt, /# Repository-aware pull-request review/u);
    assert.match(combinedPrompt, /## Publication contract/u);
  });
}
