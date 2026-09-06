export type ReviewVerdict = "approved" | "needs-change";
export type ReviewResult = { verdict: ReviewVerdict };

export function readReviewResult(value: unknown): ReviewResult {
  if (
    !value ||
    typeof value !== "object" ||
    !("verdict" in value) ||
    (value.verdict !== "approved" && value.verdict !== "needs-change")
  ) {
    throw new Error("Expected a structured approved or needs-change verdict.");
  }
  return { verdict: value.verdict };
}

export function resultFromSafeOutputs(output: unknown): ReviewResult {
  const error = "Expected one complete review and one structured verdict.";
  if (
    !output ||
    typeof output !== "object" ||
    !("items" in output) ||
    !Array.isArray(output.items) ||
    ("errors" in output &&
      (!Array.isArray(output.errors) || output.errors.length !== 0))
  ) {
    throw new Error(error);
  }
  let reviews = 0;
  const results: ReviewResult[] = [];
  for (const item of output.items) {
    if (!item || typeof item !== "object" || !("type" in item)) {
      throw new Error(error);
    }
    switch (item.type) {
      case "record_review_verdict":
        results.push(readReviewResult(item));
        break;
      case "submit_pull_request_review":
        if (!("event" in item) || item.event !== "COMMENT") {
          throw new Error(error);
        }
        reviews += 1;
        break;
      case "create_pull_request_review_comment":
        break;
      default:
        throw new Error(error);
    }
  }
  const result = results[0];
  if (reviews !== 1 || results.length !== 1 || !result) throw new Error(error);
  return result;
}

export function requireApproved(result: ReviewResult): void {
  if (result.verdict === "needs-change") {
    throw new Error("AI review requires changes.");
  }
}
