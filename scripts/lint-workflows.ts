import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
