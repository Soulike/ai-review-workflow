export type ReviewConfig = {
  baseSha: string;
  expectedHeadSha: string;
  prNumber: number;
};

export function readReviewConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ReviewConfig {
  const baseSha = environment.AI_REVIEW_BASE_SHA ?? "";
  const expectedHeadSha = environment.AI_REVIEW_HEAD_SHA ?? "";
  const number = environment.AI_REVIEW_PR_NUMBER ?? "";
  if (
    !/^[0-9a-f]{40}$/u.test(baseSha) ||
    !/^[0-9a-f]{40}$/u.test(expectedHeadSha)
  ) {
    throw new Error("Base and head must be lowercase 40-character Git SHAs.");
  }
  const prNumber = Number(number);
  if (!/^[1-9][0-9]*$/u.test(number) || !Number.isSafeInteger(prNumber)) {
    throw new Error("PR number must be a positive safe integer.");
  }
  return { baseSha, expectedHeadSha, prNumber };
}
