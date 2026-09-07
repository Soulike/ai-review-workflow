import { parseArgs } from "node:util";

import { loadReviewSettings } from "./lib/review-settings.ts";

try {
  const { values } = parseArgs({
    options: { "repository-root": { type: "string" } },
  });
  const repositoryRoot = values["repository-root"];
  if (!repositoryRoot) throw new Error("--repository-root is required.");
  await loadReviewSettings(
    {
      model: process.env.AI_REVIEW_MODEL,
      reasoningEffort: process.env.AI_REVIEW_REASONING_EFFORT,
      reviewPromptPath: process.env.AI_REVIEW_PROMPT_PATH,
    },
    repositoryRoot,
  );
  console.log("Review configuration is valid.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Review preflight failed.",
  );
  process.exitCode = 1;
}
