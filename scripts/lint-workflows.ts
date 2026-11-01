import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { parseDocument } from "yaml";

// GitHub MCP reads check runs and combined commit statuses through separate
// API permissions. Every level must retain these narrow read capabilities.
for (const [file, job] of [
  [".github/workflows/review-pr.yml", "review"],
  [".github/workflows/ai-review.yml", "engine"],
  [".github/workflows/review.lock.yml", "agent"],
] as const) {
  const workflow = parseDocument(await readFile(file, "utf8"));
  for (const permission of ["checks", "statuses"]) {
    if (workflow.getIn(["jobs", job, "permissions", permission]) !== "read") {
      throw new Error(
        `${file}: jobs.${job}.permissions must grant ${permission}: read for review evidence.`,
      );
    }
  }
}

const { stdout, stderr } = await promisify(execFile)(
  process.env.ACTIONLINT ?? "actionlint",
  [
    "-shellcheck=",
    // actionlint 1.7.12 predates these documented GitHub.com features.
    "-ignore",
    'unknown permission scope "(copilot-requests|vulnerability-alerts)"',
    "-ignore",
    'property "workflow_(repository|sha)" is not defined',
    "-ignore",
    'unexpected key "queue" for "concurrency"',
    ".github/workflows/ci.yml",
    ".github/workflows/ai-review.yml",
    ".github/workflows/review-pr.yml",
    ".github/workflows/review.lock.yml",
  ],
);
process.stdout.write(stdout);
process.stderr.write(stderr);
