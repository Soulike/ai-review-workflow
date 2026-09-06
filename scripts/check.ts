import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  assertNoGeneratedDrift,
  compileAgenticWorkflows,
} from "../src/compiler-contract.ts";

const executeFile = promisify(execFile);

await compileAgenticWorkflows();
const { stdout } = await executeFile(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ".gitattributes",
    ".github/aw",
    ":(glob).github/workflows/*.lock.yml",
  ],
  { env: process.env },
);
assertNoGeneratedDrift(stdout);
