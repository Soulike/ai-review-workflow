import {
  positiveInteger,
  readReviewConfig,
  readReviewEvent,
  sha,
} from "../src/config.ts";
import { GitHubClient } from "../src/github.ts";
import { enforceReviewGate } from "../src/review-gate.ts";

try {
  const config = readReviewConfig();
  const event = readReviewEvent();
  if (event.isDraft || event.action === "converted_to_draft") {
    throw new Error(
      "AI review cannot pass for a draft pull request. Mark it ready to request a review.",
    );
  }
  for (const name of ["AI_REVIEW_PREPARE_RESULT", "AI_REVIEW_GUARD_RESULT"]) {
    if (process.env[name] !== "success")
      throw new Error(
        `${name} did not succeed (${process.env[name] ?? "missing"}). Re-run all jobs after correcting the cause.`,
      );
  }
  if (process.env.AI_REVIEW_PREPARE_ATTEMPT !== String(config.runAttempt)) {
    throw new Error("Earlier inference cannot be reused. Re-run all jobs.");
  }
  const client = new GitHubClient(
    process.env.GITHUB_TOKEN ?? "",
    config.repository,
  );
  const result = await enforceReviewGate(client, {
    ...config,
    ...event,
    callId: positiveInteger(
      process.env.AI_REVIEW_CALL_ID ?? "",
      "AI_REVIEW_CALL_ID",
    ),
    implementationSha: sha(
      process.env.AI_REVIEW_IMPLEMENTATION_SHA ?? "",
      "AI_REVIEW_IMPLEMENTATION_SHA",
    ),
  });
  console.log(`AI review ${result} for ${config.expectedHeadSha}.`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "AI review gate failed.",
  );
  process.exitCode = 1;
}
