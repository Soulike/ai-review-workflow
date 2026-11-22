import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const entrypoint = fileURLToPath(
  new URL("./select-search-mcp.ts", import.meta.url),
);

function assertExitFailure(pattern: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok("code" in error && error.code === 1);
    assert.ok("stderr" in error && typeof error.stderr === "string");
    assert.match(error.stderr, pattern);
    return true;
  };
}

test("selects deepseek-web when DEEPSEEK_API_KEY is present and ignores TAVILY_API_KEY", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "select-search-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const env of [
    { DEEPSEEK_API_KEY: "ds-key" },
    { DEEPSEEK_API_KEY: "ds-key", TAVILY_API_KEY: "tvly-key" },
  ]) {
    const githubOutput = path.join(root, "github-output");
    await writeFile(githubOutput, "");
    const { stdout } = await execute(process.execPath, [entrypoint], {
      env: { ...env, GITHUB_OUTPUT: githubOutput },
    });
    assert.equal(await readFile(githubOutput, "utf8"), "mcp=deepseek-web\n");
    assert.match(stdout, /deepseek-web/u);
  }
});

test("selects tavily when only TAVILY_API_KEY is present", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "select-search-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const env of [
    { TAVILY_API_KEY: "tvly-key" },
    { DEEPSEEK_API_KEY: "   ", TAVILY_API_KEY: "tvly-key" },
  ]) {
    const githubOutput = path.join(root, "github-output");
    await writeFile(githubOutput, "");
    const { stdout } = await execute(process.execPath, [entrypoint], {
      env: { ...env, GITHUB_OUTPUT: githubOutput },
    });
    assert.equal(await readFile(githubOutput, "utf8"), "mcp=tavily\n");
    assert.match(stdout, /tavily/u);
  }
});

test("fails when neither DEEPSEEK_API_KEY nor TAVILY_API_KEY is provided", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "select-search-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const env of [{}, { DEEPSEEK_API_KEY: "", TAVILY_API_KEY: "  \n  " }]) {
    const githubOutput = path.join(root, "github-output");
    await writeFile(githubOutput, "");
    await assert.rejects(
      execute(process.execPath, [entrypoint], {
        env: { ...env, GITHUB_OUTPUT: githubOutput },
      }),
      assertExitFailure(/DEEPSEEK_API_KEY.*TAVILY_API_KEY/u),
    );
    assert.equal(await readFile(githubOutput, "utf8"), "");
  }
});

test("fails when GITHUB_OUTPUT is missing", async () => {
  await assert.rejects(
    execute(process.execPath, [entrypoint], {
      env: { DEEPSEEK_API_KEY: "ds-key" },
    }),
    assertExitFailure(/GITHUB_OUTPUT/u),
  );
});
