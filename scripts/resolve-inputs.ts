import { appendFile } from "node:fs/promises";
import { requireReasoningEffort } from "../src/configuration.ts";

const effort = requireReasoningEffort(process.env.KESTREL_REASONING_EFFORT);
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required.");
await appendFile(process.env.GITHUB_OUTPUT, `reasoning-effort=${effort}\n`);
