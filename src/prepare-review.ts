import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepareReviewConfig, type ReviewInputs } from "./configuration.ts";
import type { ReviewConfig } from "./config.ts";

const executeFile = promisify(execFile);

export async function prepareReview(
  repositoryRoot: string,
  inputs: ReviewInputs,
  identity: ReviewConfig,
  token: string,
) {
  const config = await prepareReviewConfig(inputs, repositoryRoot);
  const git = async (...args: string[]) =>
    (await executeFile("git", ["-C", repositoryRoot, ...args])).stdout.trim();
  if ((await git("rev-parse", "HEAD")) !== identity.baseSha) {
    throw new Error("Consumer checkout is not the exact event base.");
  }
  const header = Buffer.from(`x-access-token:${token}`).toString("base64");
  await executeFile(
    "git",
    [
      "-C",
      repositoryRoot,
      "fetch",
      "--no-tags",
      "origin",
      `refs/pull/${identity.prNumber}/head`,
    ],
    {
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.extraheader",
        GIT_CONFIG_VALUE_0: `Authorization: Basic ${header}`,
      },
    },
  );
  if ((await git("rev-parse", "FETCH_HEAD")) !== identity.expectedHeadSha) {
    throw new Error(
      "Pull-request head changed before review; request a fresh run.",
    );
  }
  await git("cat-file", "-e", `${identity.expectedHeadSha}^{commit}`);
  return config;
}
