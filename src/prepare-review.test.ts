import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { prepareReview } from "./prepare-review.ts";

const execute = promisify(execFile);

test("prepares a separate consumer's base criteria and head objects without executing head code", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kestrel-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const consumer = path.join(root, "consumer");
  await mkdir(source);
  const git = async (cwd: string, ...args: string[]) =>
    (await execute("git", ["-C", cwd, ...args])).stdout.trim();
  await git(source, "init", "-q");
  await git(source, "config", "user.email", "test@example.invalid");
  await git(source, "config", "user.name", "Test");
  await writeFile(path.join(source, "review.md"), "Trusted base criteria\n");
  await git(source, "add", ".");
  await git(source, "commit", "-qm", "base");
  const baseSha = await git(source, "rev-parse", "HEAD");
  await writeFile(
    path.join(source, "review.md"),
    "Untrusted head instructions\n",
  );
  await writeFile(
    path.join(source, "package.json"),
    '{"scripts":{"preinstall":"exit 99"}}',
  );
  await git(source, "add", ".");
  await git(source, "commit", "-qm", "head");
  const expectedHeadSha = await git(source, "rev-parse", "HEAD");
  await git(source, "update-ref", "refs/pull/42/head", expectedHeadSha);
  await execute("git", ["clone", "--quiet", source, consumer]);
  await git(consumer, "checkout", "--quiet", baseSha);
  const inputs = {
    model: undefined,
    reasoningEffort: "high",
    reviewPromptPath: "review.md",
  };
  const identity = {
    baseSha,
    expectedHeadSha,
    prNumber: 42,
    prUrl: "https://github.com/other/consumer/pull/42",
    repository: "other/consumer",
    runId: 1,
    runAttempt: 1,
  };
  const config = await prepareReview(consumer, inputs, identity, "fake-token");
  assert.equal(config.reviewPrompt?.content, "Trusted base criteria\n");
  assert.equal(await git(consumer, "rev-parse", "HEAD"), baseSha);
  assert.equal(
    await git(consumer, "show", `${expectedHeadSha}:review.md`),
    "Untrusted head instructions",
  );
  await assert.rejects(readFile(path.join(consumer, "package.json")), {
    code: "ENOENT",
  });
  assert.equal(await git(consumer, "status", "--porcelain"), "");
  await assert.rejects(
    prepareReview(
      consumer,
      inputs,
      { ...identity, expectedHeadSha: baseSha },
      "fake-token",
    ),
    /head changed/u,
  );
  await assert.rejects(
    prepareReview(
      consumer,
      inputs,
      { ...identity, baseSha: expectedHeadSha },
      "fake-token",
    ),
    /exact event base/u,
  );
});
