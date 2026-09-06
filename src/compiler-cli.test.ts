import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compileAgenticWorkflows } from "./compiler-contract.ts";

test("compiler launcher checks its selected binary and propagates compiler failures", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kestrel-compiler-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const compiler = path.join(root, "compiler");
  const marker = path.join(root, "called");
  await writeFile(
    compiler,
    '#!/bin/sh\nif [ "$1" = --version ]; then echo "gh aw version $TEST_VERSION"; else printf "%s" "$*" > "$TEST_MARKER"; exit 23; fi\n',
  );
  await chmod(compiler, 0o755);
  const env = {
    GH_AW_COMPILER: compiler,
    TEST_MARKER: marker,
    TEST_VERSION: "v0.87.10",
  };
  await assert.rejects(
    compileAgenticWorkflows(env),
    /Expected gh-aw compiler v0\.88\.2/u,
  );
  await assert.rejects(readFile(marker), { code: "ENOENT" });
  await assert.rejects(
    compileAgenticWorkflows({ ...env, TEST_VERSION: "v0.88.2" }),
    /exit code 23/u,
  );
  assert.match(
    await readFile(marker, "utf8"),
    /--action-tag v0.88.2 --strict --validate/u,
  );
  await assert.rejects(
    compileAgenticWorkflows({ GH_AW_COMPILER: path.join(root, "absent") }),
    { code: "ENOENT" },
  );
});
