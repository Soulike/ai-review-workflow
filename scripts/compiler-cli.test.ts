import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { compileAgenticWorkflows } from "./lib/compiler-contract.ts";

const execute = promisify(execFile);

test("standalone and gh-extension launchers check versions, pass arguments, and propagate failure", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-compiler-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const marker = path.join(root, "called");
  const script =
    'if [ "$1" = --version ]; then echo "gh aw version $TEST_VERSION"; else printf "%s\\n" "$@" > "$TEST_MARKER"; exit 23; fi\n';
  for (const standalone of [true, false]) {
    const compiler = path.join(root, standalone ? "compiler" : "gh");
    await writeFile(
      compiler,
      "#!/bin/sh\nset -eu\n" +
        (standalone ? "" : 'test "$1" = aw\nshift\n') +
        script,
    );
    await chmod(compiler, 0o755);
    await rm(marker, { force: true });
    const env = {
      PATH: root + path.delimiter + process.env.PATH,
      ...(standalone ? { GH_AW_COMPILER: compiler } : {}),
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
    assert.deepEqual((await readFile(marker, "utf8")).trim().split("\n"), [
      "compile",
      "--action-mode",
      "release",
      "--action-tag",
      "v0.88.2",
      "--strict",
      "--validate",
      "--no-check-update",
    ]);
  }
  await assert.rejects(
    compileAgenticWorkflows({ GH_AW_COMPILER: path.join(root, "absent") }),
    { code: "ENOENT" },
  );
});

test("the drift-check entrypoint rejects generated changes made by compilation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workflow-drift-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".github/workflows"), { recursive: true });
  await mkdir(path.join(root, ".github/aw"), { recursive: true });
  const generated = [
    ".gitattributes",
    ".github/aw/actions-lock.json",
    ".github/workflows/review.lock.yml",
  ];
  for (const file of generated) await writeFile(path.join(root, file), "");
  const gitEnv = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const git = (...args: string[]) =>
    execute("git", args, { cwd: root, env: gitEnv });
  await git("init", "--quiet");
  await git("add", ...generated);
  await git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "baseline",
  );

  const compiler = path.join(root, "compiler");
  await writeFile(
    compiler,
    '#!/bin/sh\nset -eu\nif [ "$1" = --version ]; then echo "gh aw version v0.88.2"; exit; fi\ncase "$TEST_DRIFT_ACTION" in\nwrite) printf "compiled\\n" >> "$TEST_DRIFT_PATH";;\ndelete) rm "$TEST_DRIFT_PATH";;\nesac\n',
  );
  await chmod(compiler, 0o755);
  const entrypoint = fileURLToPath(new URL("./check.ts", import.meta.url));
  const run = (extra: NodeJS.ProcessEnv = {}) =>
    execute(process.execPath, [entrypoint], {
      cwd: root,
      env: {
        ...gitEnv,
        GH_AW_COMPILER: compiler,
        TEST_DRIFT_ACTION: "",
        ...extra,
      },
    });
  await run();
  for (const [file, action] of [
    [".github/workflows/review.lock.yml", "write"],
    [".github/workflows/new.lock.yml", "write"],
    [".gitattributes", "write"],
    [".github/aw/actions-lock.json", "delete"],
  ] as const) {
    await assert.rejects(
      run({ TEST_DRIFT_PATH: file, TEST_DRIFT_ACTION: action }),
      (error: unknown) => {
        assert.ok(
          error instanceof Error && "code" in error && error.code === 1,
        );
        assert.ok("stderr" in error && typeof error.stderr === "string");
        assert.match(
          error.stderr,
          /Generated Agentic workflow artifacts are stale/u,
        );
        assert.ok(error.stderr.includes(file));
        return true;
      },
    );
    for (const original of generated)
      await writeFile(path.join(root, original), "");
    await rm(path.join(root, ".github/workflows/new.lock.yml"), {
      force: true,
    });
  }
  await run();
});
