import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";
import { readReviewTarget } from "./lib/review-target.ts";
import { prepareReview } from "./lib/prepare-review.ts";

const { values } = parseArgs({
  options: { "repository-root": { type: "string" } },
});
if (!values["repository-root"])
  throw new Error("--repository-root is required.");
const expectedVersion = process.env.AI_REVIEW_COPILOT_VERSION;
if (
  !expectedVersion ||
  !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(expectedVersion)
) {
  throw new Error("Missing or invalid selected Copilot CLI version.");
}
const { stdout } = await promisify(execFile)("copilot", [
  "--no-auto-update",
  "--version",
]);
if (stdout.split("\n")[0] !== `GitHub Copilot CLI ${expectedVersion}.`) {
  throw new Error("Installed Copilot CLI does not match the selected version.");
}
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
console.log(
  `Verified Copilot CLI ${expectedVersion} and exact review revisions.`,
);
