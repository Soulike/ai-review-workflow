export function assertCompletePublication(output: unknown): void {
  const error =
    "Expected one complete review with only review publication effects; incomplete results have no verdict.";
  if (
    !output ||
    typeof output !== "object" ||
    !("items" in output) ||
    !Array.isArray(output.items)
  ) {
    throw new Error(error);
  }
  let reviews = 0;
  for (const item of output.items) {
    if (!item || typeof item !== "object" || !("type" in item))
      throw new Error(error);
    if (item.type === "submit_pull_request_review") reviews += 1;
    else if (item.type !== "create_pull_request_review_comment")
      throw new Error(error);
  }
  if (reviews !== 1) throw new Error(error);
}
