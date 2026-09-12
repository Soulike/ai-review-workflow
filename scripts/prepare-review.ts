import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { readReviewTarget } from "./lib/review-target.ts";
import { prepareReview } from "./lib/prepare-review.ts";

const { values } = parseArgs({
  options: { "repository-root": { type: "string" } },
});
if (!values["repository-root"])
  throw new Error("--repository-root is required.");
const settings = await prepareReview(
  values["repository-root"],
  {
    model: process.env.AI_REVIEW_MODEL,
    reasoningEffort: process.env.AI_REVIEW_REASONING_EFFORT,
    reviewPromptPath: process.env.AI_REVIEW_PROMPT_PATH,
  },
  readReviewTarget(),
  process.env.GITHUB_TOKEN ?? "",
);
await mkdir("/tmp/gh-aw", { recursive: true });
await writeFile(
  "/tmp/gh-aw/repository-review-prompt.md",
  settings.reviewPrompt?.content ??
    "No additional repository review criteria.\n",
);
console.log("Verified exact review revisions.");
