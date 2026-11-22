import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const entrypoint = fileURLToPath(new URL("./engine-gate.ts", import.meta.url));

function assertExitFailure(pattern: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok("code" in error && error.code === 1);
    assert.ok("stderr" in error && typeof error.stderr === "string");
    assert.match(error.stderr, pattern);
    return true;
  };
}

test("passes when select_search_mcp and the selected engine succeed while the other engine is skipped", async () => {
  for (const env of [
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "deepseek-web",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "success",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "tavily",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "success",
    },
  ]) {
    const { stdout } = await execute(process.execPath, [entrypoint], { env });
    assert.match(stdout, /Engine completed/u);
  }
});

test("fails when select_search_mcp did not succeed or selected MCP is invalid", async () => {
  for (const env of [
    {
      AI_REVIEW_SELECT_RESULT: "failure",
      AI_REVIEW_SELECTED_MCP: "",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
    {
      AI_REVIEW_SELECT_RESULT: "cancelled",
      AI_REVIEW_SELECTED_MCP: "deepseek-web",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "unknown",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
  ]) {
    await assert.rejects(
      execute(process.execPath, [entrypoint], { env }),
      assertExitFailure(
        /select_search_mcp did not succeed|Selected search MCP must be supported/u,
      ),
    );
  }
});

test("fails when the selected engine is unsuccessful or the unselected engine was not skipped", async () => {
  for (const env of [
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "deepseek-web",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "failure",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "deepseek-web",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "skipped",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "tavily",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "skipped",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "cancelled",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "deepseek-web",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "success",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "failure",
    },
    {
      AI_REVIEW_SELECT_RESULT: "success",
      AI_REVIEW_SELECTED_MCP: "tavily",
      AI_REVIEW_DEEPSEEK_ENGINE_RESULT: "success",
      AI_REVIEW_TAVILY_ENGINE_RESULT: "success",
    },
  ]) {
    await assert.rejects(
      execute(process.execPath, [entrypoint], { env }),
      assertExitFailure(
        /Engine .* did not succeed|Unselected engine .* was expected to be skipped/u,
      ),
    );
  }
});
