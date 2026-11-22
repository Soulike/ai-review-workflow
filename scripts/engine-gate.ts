import { requireEngineCompletion } from "./lib/search-mcp.ts";

try {
  const mcp = requireEngineCompletion({
    selectResult: process.env.AI_REVIEW_SELECT_RESULT,
    selectedMcp: process.env.AI_REVIEW_SELECTED_MCP,
    deepseekEngineResult: process.env.AI_REVIEW_DEEPSEEK_ENGINE_RESULT,
    tavilyEngineResult: process.env.AI_REVIEW_TAVILY_ENGINE_RESULT,
  });
  console.log(`Engine completed (${mcp}).`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "AI review engine gate failed.",
  );
  process.exitCode = 1;
}
