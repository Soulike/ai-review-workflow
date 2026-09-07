import { readFile } from "node:fs/promises";
import { readReviewResult, requireApproved } from "./lib/review-result.ts";

try {
  for (const name of [
    "AI_REVIEW_PREPARE_RESULT",
    "AI_REVIEW_AGENT_RESULT",
    "AI_REVIEW_SAFE_OUTPUTS_RESULT",
    "AI_REVIEW_VERDICT_RESULT",
  ]) {
    if (process.env[name] !== "success") {
      throw new Error(
        `${name} did not succeed (${process.env[name] ?? "missing"}).`,
      );
    }
  }
  const [file] = process.argv.slice(2);
  if (!file) throw new Error("The review-result artifact path is required.");
  const result = readReviewResult(JSON.parse(await readFile(file, "utf8")));
  requireApproved(result);
  console.log("AI review approved.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "AI review gate failed.",
  );
  process.exitCode = 1;
}
