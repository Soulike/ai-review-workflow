import { appendFile } from "node:fs/promises";
import { requireReasoningEffort } from "./lib/review-settings.ts";

const effort = requireReasoningEffort(process.env.AI_REVIEW_REASONING_EFFORT);
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
await appendFile(process.env.GITHUB_OUTPUT, `reasoning-effort=${effort}\n`);
