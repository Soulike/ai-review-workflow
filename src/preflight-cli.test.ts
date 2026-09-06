import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const entrypoint = fileURLToPath(
  new URL("../scripts/preflight.ts", import.meta.url),
);

test("preflight is executable from a different working directory", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kestrel-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, "review.md"),
    "Keep this private prompt out of stdout.",
  );
  const { stdout } = await execute(
    process.execPath,
    [entrypoint, "--repository-root", root],
    {
      cwd: tmpdir(),
      env: {
        KESTREL_REASONING_EFFORT: "high",
        KESTREL_REVIEW_PROMPT_PATH: "review.md",
      },
    },
  );
  assert.equal(stdout, "Review configuration is valid.\n");
});

test("preflight reports invalid configuration with a failing exit status", async () => {
  await assert.rejects(
    execute(process.execPath, [entrypoint, "--repository-root", tmpdir()], {
      env: {},
    }),
    (error: unknown) => {
      assert(error instanceof Error);
      assert("code" in error && error.code === 1);
      assert("stderr" in error && typeof error.stderr === "string");
      assert.match(error.stderr, /reasoning-effort is required/u);
      assert("stdout" in error && error.stdout === "");
      return true;
    },
  );
});
