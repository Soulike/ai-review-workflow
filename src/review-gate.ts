import type { ReviewEventContext } from "./config.ts";
import type {
  GitHubClient,
  PullRequest,
  PullRequestReview,
  PullRequestReviewComment,
  WorkflowJob,
} from "./github.ts";
import {
  AI_REVIEW_AUTHOR,
  AI_REVIEW_WORKFLOW_ID,
  AI_REVIEW_WORKFLOW_NAME,
  type FindingCounts,
  findingSeverities,
  parsePublicationIdentity,
  parseInlineFindingSeverity,
  parseReviewBody,
  type ReviewVerdict,
} from "./review-state.ts";

export type ReviewIdentity = {
  baseSha: string;
  expectedHeadSha: string;
  prNumber: number;
  repository: string;
  runAttempt: number;
  runId: number;
  callId: number;
  implementationSha: string;
};

export type ReviewGateContext = ReviewIdentity & ReviewEventContext;

type ReviewGateClient = Pick<
  GitHubClient,
  "getPullRequest" | "listReviewComments" | "listReviews" | "listRunAttemptJobs"
>;

export function assertCurrentPullRequest(
  identity: Pick<ReviewIdentity, "prNumber" | "baseSha" | "expectedHeadSha">,
  pullRequest: PullRequest,
): void {
  if (
    pullRequest.number !== identity.prNumber ||
    pullRequest.state !== "open" ||
    pullRequest.isDraft ||
    pullRequest.baseSha !== identity.baseSha ||
    pullRequest.headSha !== identity.expectedHeadSha
  ) {
    throw new Error(
      `Pull request changed during review: expected ${identity.baseSha}...${identity.expectedHeadSha}, received ${pullRequest.baseSha}...${pullRequest.headSha} (${pullRequest.state}).`,
    );
  }
}

function assertExactFindingCounts(
  review: PullRequestReview,
  reviewComments: PullRequestReviewComment[],
  visible: FindingCounts,
  bodyOnly: FindingCounts,
): void {
  const inline: FindingCounts = { high: 0, low: 0, medium: 0, nit: 0 };
  for (const comment of reviewComments.filter(
    (candidate) => candidate.reviewId === review.id,
  )) {
    const severity = parseInlineFindingSeverity(comment.body);
    if (!severity) {
      throw new Error(
        `Review ${review.id} contains an inline comment without a valid finding severity.`,
      );
    }
    inline[severity] += 1;
  }
  for (const severity of findingSeverities) {
    if (inline[severity] + bodyOnly[severity] !== visible[severity]) {
      throw new Error(
        `Review ${review.id} finding counts do not equal its inline and body-only findings.`,
      );
    }
  }
}

function jobWindow(
  jobs: WorkflowJob[],
  checkRunId: number,
): {
  completedAt: number;
  startedAt: number;
} {
  const matches = jobs.filter((job) => job.checkRunId === checkRunId);
  if (
    matches.length !== 1 ||
    matches[0]?.status !== "completed" ||
    matches[0].conclusion !== "success" ||
    !matches[0].startedAt ||
    !matches[0].completedAt
  ) {
    throw new Error(
      "Expected exactly one successful bound job in the current run attempt.",
    );
  }
  const startedAt = Date.parse(matches[0].startedAt);
  const completedAt = Date.parse(matches[0].completedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    completedAt < startedAt
  ) {
    throw new Error(
      "The current run attempt has an invalid safe_outputs window.",
    );
  }
  return { completedAt, startedAt };
}

export function verifyPublishedReview(
  identity: ReviewIdentity,
  pullRequest: PullRequest,
  reviews: PullRequestReview[],
  reviewComments: PullRequestReviewComment[],
  jobs: WorkflowJob[],
): ReviewVerdict {
  assertCurrentPullRequest(identity, pullRequest);
  const guardWindow = jobWindow(jobs, identity.callId);
  const expectedRunUrl = `https://github.com/${identity.repository}/actions/runs/${identity.runId}`;
  let outsideCurrentAttempt = 0;
  const matchingReviews = reviews.flatMap((review) => {
    if (
      review.authorLogin !== AI_REVIEW_AUTHOR ||
      review.commitSha !== identity.expectedHeadSha ||
      review.state !== "COMMENTED"
    ) {
      return [];
    }
    const parsed = parseReviewBody(review.body);
    const publication = parsePublicationIdentity(review.body);
    if (
      !publication ||
      publication.callId !== identity.callId ||
      publication.implementationSha !== identity.implementationSha ||
      publication.runAttempt !== identity.runAttempt ||
      parsed?.attribution.workflowName !== AI_REVIEW_WORKFLOW_NAME ||
      parsed.attribution.workflowId !== AI_REVIEW_WORKFLOW_ID ||
      parsed.attribution.runId !== identity.runId ||
      parsed.attribution.runUrl !== expectedRunUrl ||
      parsed.reviewedHeadSha !== identity.expectedHeadSha
    ) {
      return [];
    }
    const window = jobWindow(jobs, publication.checkRunId);
    if (
      publication.checkRunId === identity.callId ||
      window.startedAt < guardWindow.completedAt
    ) {
      throw new Error(
        "Publication did not follow this invocation's current-subject guard.",
      );
    }
    const submittedAt = Date.parse(review.submittedAt ?? "");
    if (
      !Number.isFinite(submittedAt) ||
      submittedAt < window.startedAt ||
      submittedAt > window.completedAt
    ) {
      outsideCurrentAttempt += 1;
      return [];
    }
    assertExactFindingCounts(
      review,
      reviewComments,
      parsed.counts,
      parsed.bodyOnlyCounts,
    );
    return [{ parsed, review }];
  });

  if (matchingReviews.length === 0 && outsideCurrentAttempt > 0) {
    throw new Error(
      "The attributed review was not published by the current run attempt.",
    );
  }
  const match = matchingReviews[0];
  if (matchingReviews.length !== 1 || !match) {
    throw new Error(
      `Expected exactly one COMMENT review for run ${identity.runId}, attempt ${identity.runAttempt}, and head ${identity.expectedHeadSha}; found ${matchingReviews.length}.`,
    );
  }
  return match.parsed.verdict;
}

async function readPublishedReview(
  client: ReviewGateClient,
  context: ReviewGateContext,
): Promise<ReviewVerdict> {
  const [pullRequest, reviews, reviewComments, jobs] = await Promise.all([
    client.getPullRequest(context.prNumber),
    client.listReviews(context.prNumber),
    client.listReviewComments(context.prNumber),
    client.listRunAttemptJobs(context.runId, context.runAttempt),
  ]);
  return verifyPublishedReview(
    context,
    pullRequest,
    reviews,
    reviewComments,
    jobs,
  );
}

export async function enforceReviewGate(
  client: ReviewGateClient,
  context: ReviewGateContext,
): Promise<"approved"> {
  if (context.action === "converted_to_draft" || context.isDraft) {
    throw new Error("AI review cannot pass for a draft pull request.");
  }

  if (context.agentJobResult !== "success") {
    throw new Error(
      `The Copilot Agent job did not succeed (${context.agentJobResult}).`,
    );
  }
  if (context.safeOutputsJobResult !== "success") {
    throw new Error(
      `The review safe-output job did not succeed (${context.safeOutputsJobResult}).`,
    );
  }

  const verdict = await readPublishedReview(client, context);

  if (verdict === "needs-change") {
    throw new Error("AI review requires changes.");
  }
  return "approved";
}
