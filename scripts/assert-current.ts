import { appendFile, readFile } from "node:fs/promises";
import { positiveInteger, readReviewConfig } from "../src/config.ts";
import { GitHubClient } from "../src/github.ts";
import { assertCurrentPullRequest } from "../src/review-gate.ts";
import { assertCompletePublication } from "../src/publication.ts";

const config = readReviewConfig();
const output: unknown = JSON.parse(
  await readFile("/tmp/review-publication/agent_output.json", "utf8"),
);
assertCompletePublication(output);
const client = new GitHubClient(
  process.env.GITHUB_TOKEN ?? "",
  config.repository,
);
assertCurrentPullRequest(config, await client.getPullRequest(config.prNumber));
const callId = positiveInteger(
  process.env.AI_REVIEW_CALL_ID ?? "",
  "AI_REVIEW_CALL_ID",
);
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
await appendFile(process.env.GITHUB_OUTPUT, `call-id=${callId}\n`);
