export const reviewVerdicts = ["approved", "needs-change"] as const;
export type ReviewVerdict = (typeof reviewVerdicts)[number];

export const AI_REVIEW_AUTHOR = "github-actions[bot]";
export const AI_REVIEW_WORKFLOW_ID = "review";
export const AI_REVIEW_WORKFLOW_NAME = "AI review";
export const findingSeverities = ["high", "medium", "low", "nit"] as const;

export type FindingCounts = {
  high: number;
  low: number;
  medium: number;
  nit: number;
};
export type FindingSeverity = keyof FindingCounts;

export type ParsedReviewBody = {
  attribution: {
    runId: number;
    runUrl: string;
    workflowId: string;
    workflowName: string;
  };
  bodyOnlyCounts: FindingCounts;
  counts: FindingCounts;
  model: string;
  reviewedHeadSha: string;
  verdict: ReviewVerdict;
};

const visibleVerdictPattern =
  /^- \*\*Verdict:\*\* `(approved|needs-change)`$/gmu;
const visibleModelPattern = /^- \*\*Model:\*\* `([^`\r\n]{1,100})`$/gmu;
const visibleFindingsPattern =
  /^- \*\*Findings:\*\* high: (0|[1-9][0-9]*), medium: (0|[1-9][0-9]*), low: (0|[1-9][0-9]*), nit: (0|[1-9][0-9]*)$/gmu;
const visibleHeadPattern = /^- \*\*Reviewed head:\*\* `([0-9a-f]{40})`$/gmu;
const bodyOnlyHeadingPattern = /^## Findings not posted inline$/gmu;
const bodyOnlyFindingPattern =
  /^- \*\*\[(high|medium|low|nit)\] [^*\r\n]{1,300}\*\*$/gmu;
const bodyOnlyNonePattern = /^None\.$/gmu;
const inlineFindingPattern =
  /^\*\*\[(high|medium|low|nit)\] [^*\r\n]{1,300}\*\*/u;
const frameworkMarkerPattern =
  /<!--\s*gh-aw-agentic-workflow:\s*([^>]*?)\s*-->/gu;

function oneMatch(pattern: RegExp, body: string): RegExpMatchArray | null {
  const matches = [...body.matchAll(pattern)];
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function safeCount(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function attribution(
  marker: RegExpMatchArray,
): ParsedReviewBody["attribution"] | null {
  const parts = marker[1]?.split(/,\s*/u) ?? [];
  const workflowName = parts.shift()?.trim();
  if (!workflowName) {
    return null;
  }
  const fields = new Map<string, string>();
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator < 1) {
      return null;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value || fields.has(key)) {
      return null;
    }
    fields.set(key, value);
  }
  const runId = safeCount(fields.get("id"));
  const runUrl = fields.get("run");
  const workflowId = fields.get("workflow_id");
  if (runId === null || runId < 1 || !runUrl || !workflowId) {
    return null;
  }
  return { runId, runUrl, workflowId, workflowName };
}

function bodyOnlyFindingCounts(
  body: string,
  marker: RegExpMatchArray,
  visible: FindingCounts,
): FindingCounts | null {
  const heading = oneMatch(bodyOnlyHeadingPattern, body);
  if (heading?.index === undefined || marker.index === undefined) {
    return null;
  }
  const sectionStart = heading.index + heading[0].length;
  if (sectionStart >= marker.index) {
    return null;
  }
  const section = body.slice(sectionStart, marker.index);
  const none = [...section.matchAll(bodyOnlyNonePattern)];
  const findings = [...section.matchAll(bodyOnlyFindingPattern)];
  if (
    (none.length === 1 && findings.length > 0) ||
    none.length > 1 ||
    (none.length === 0 && findings.length === 0)
  ) {
    return null;
  }
  const bodyOnly: FindingCounts = { high: 0, low: 0, medium: 0, nit: 0 };
  for (const finding of findings) {
    const severity = findingSeverities.find((value) => value === finding[1]);
    if (!severity) return null;
    bodyOnly[severity] += 1;
  }
  return findingSeverities.every(
    (severity) => bodyOnly[severity] <= visible[severity],
  )
    ? bodyOnly
    : null;
}

export function parseInlineFindingSeverity(
  body: string,
): FindingSeverity | null {
  const value = inlineFindingPattern.exec(body)?.[1];
  return findingSeverities.find((severity) => severity === value) ?? null;
}

export function parseReviewBody(body: string | null): ParsedReviewBody | null {
  if (body === null) {
    return null;
  }
  const verdictMatch = oneMatch(visibleVerdictPattern, body);
  const modelMatch = oneMatch(visibleModelPattern, body);
  const findingsMatch = oneMatch(visibleFindingsPattern, body);
  const headMatch = oneMatch(visibleHeadPattern, body);
  const markerMatch = oneMatch(frameworkMarkerPattern, body);
  if (
    !verdictMatch ||
    !modelMatch ||
    !findingsMatch ||
    !headMatch ||
    !markerMatch
  ) {
    return null;
  }
  const high = safeCount(findingsMatch[1]);
  const medium = safeCount(findingsMatch[2]);
  const low = safeCount(findingsMatch[3]);
  const nit = safeCount(findingsMatch[4]);
  const parsedAttribution = attribution(markerMatch);
  if (
    high === null ||
    medium === null ||
    low === null ||
    nit === null ||
    !parsedAttribution
  ) {
    return null;
  }
  const verdict = reviewVerdicts.find((value) => value === verdictMatch[1]);
  const model = modelMatch[1];
  const reviewedHeadSha = headMatch[1];
  const expectedVerdict = high > 0 || medium > 0 ? "needs-change" : "approved";
  if (verdict !== expectedVerdict || !model || !reviewedHeadSha) {
    return null;
  }
  const counts = { high, low, medium, nit };
  const bodyOnlyCounts = bodyOnlyFindingCounts(body, markerMatch, counts);
  if (!bodyOnlyCounts) {
    return null;
  }
  return {
    attribution: parsedAttribution,
    bodyOnlyCounts,
    counts,
    model,
    reviewedHeadSha,
    verdict,
  };
}

export function parsePublicationIdentity(body: string | null): {
  callId: number;
  checkRunId: number;
  implementationSha: string;
  runAttempt: number;
} | null {
  if (!body || body.split("<!-- ai-review-publication:").length !== 2)
    return null;
  const match =
    /<!-- ai-review-publication: call=([1-9][0-9]*); check=([1-9][0-9]*); sha=([0-9a-f]{40}); attempt=([1-9][0-9]*) -->/u.exec(
      body,
    );
  if (!match?.[3]) return null;
  const callId = safeCount(match[1]);
  const checkRunId = safeCount(match[2]);
  const runAttempt = safeCount(match[4]);
  if (!callId || !checkRunId || !runAttempt) return null;
  return { callId, checkRunId, implementationSha: match[3], runAttempt };
}
