import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export type ReviewSettingsInput = {
  model: string | undefined;
  reasoningEffort: string | undefined;
  reviewPromptPath: string | undefined;
};

const reasoningEfforts = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export function requireReasoningEffort(
  value: string | undefined,
): ReasoningEffort {
  const effort = reasoningEfforts.find((candidate) => candidate === value);
  if (effort === undefined) {
    throw new Error(
      `reasoning-effort is required and must be supported: ${reasoningEfforts.join(", ")}.`,
    );
  }
  return effort;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readPrompt(repositoryRoot: string, reviewPromptPath: string) {
  const invalidPath =
    "review-prompt-path must name a readable Markdown file within the repository.";
  if (
    path.isAbsolute(reviewPromptPath) ||
    path.win32.isAbsolute(reviewPromptPath)
  ) {
    throw new Error(invalidPath);
  }
  if (
    ![".md", ".markdown"].includes(path.extname(reviewPromptPath).toLowerCase())
  ) {
    throw new Error(invalidPath);
  }
  try {
    const root = await realpath(repositoryRoot);
    const candidate = path.resolve(root, reviewPromptPath);
    if (!isWithin(root, candidate)) throw new Error(invalidPath);
    const target = await realpath(candidate);
    if (!isWithin(root, target) || !(await stat(target)).isFile())
      throw new Error(invalidPath);
    return { path: reviewPromptPath, content: await readFile(target, "utf8") };
  } catch (cause) {
    throw new Error(invalidPath, { cause });
  }
}

export async function loadReviewSettings(
  inputs: ReviewSettingsInput,
  repositoryRoot: string,
) {
  const reasoningEffort = requireReasoningEffort(inputs.reasoningEffort);
  const reviewPromptPath = inputs.reviewPromptPath?.trim();
  return {
    model: inputs.model?.trim() || "auto",
    reasoningEffort,
    reviewPrompt: reviewPromptPath
      ? await readPrompt(repositoryRoot, reviewPromptPath)
      : null,
  };
}
