import { appendFile } from "node:fs/promises";
import { selectSearchMcp } from "./lib/search-mcp.ts";

try {
  const selected = selectSearchMcp({
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    tavilyApiKey: process.env.TAVILY_API_KEY,
  });
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (!githubOutput) {
    throw new Error("GITHUB_OUTPUT is required.");
  }
  await appendFile(githubOutput, `mcp=${selected}\n`);
  console.log(`Selected search MCP: ${selected}`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Failed to select search MCP.",
  );
  process.exitCode = 1;
}
