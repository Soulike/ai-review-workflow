import assert from "node:assert/strict";
import test from "node:test";

import { GitHubClient } from "./github.ts";

function mockFetch(t: test.TestContext, implementation: typeof fetch): void {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  t.after(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(value), { ...init, headers });
}

test("maps exact-attempt jobs across pages and rejects an incomplete page", async (t) => {
  const urls: string[] = [];
  let mode = "complete";
  mockFetch(t, async (input) => {
    const url = String(input);
    urls.push(url);
    const pageTwo = url.includes("page=2");
    return jsonResponse({
      total_count: 2,
      jobs:
        pageTwo && mode === "incomplete"
          ? []
          : [
              {
                id: pageTwo ? 2 : 1,
                check_run_url: `https://api.github.com/repos/owner/repository/check-runs/${pageTwo ? 12 : 11}`,
                name: "Nested / safe_outputs",
                status: "completed",
                conclusion: "success",
                started_at: "2026-09-02T10:00:00Z",
                completed_at: "2026-09-02T10:01:00Z",
              },
            ],
    });
  });
  const client = new GitHubClient("token", "owner/repository");
  assert.deepEqual(await client.listRunAttemptJobs(1234, 2), [
    {
      id: 1,
      checkRunId: 11,
      name: "Nested / safe_outputs",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-09-02T10:00:00Z",
      completedAt: "2026-09-02T10:01:00Z",
    },
    {
      id: 2,
      checkRunId: 12,
      name: "Nested / safe_outputs",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-09-02T10:00:00Z",
      completedAt: "2026-09-02T10:01:00Z",
    },
  ]);
  assert.equal(
    urls[0],
    "https://api.github.com/repos/owner/repository/actions/runs/1234/attempts/2/jobs?per_page=100",
  );
  assert.ok(urls[1]?.includes("attempts/2/jobs?per_page=100&page=2"));
  mode = "incomplete";
  await assert.rejects(
    client.listRunAttemptJobs(1234, 2),
    /Incomplete job pagination/u,
  );
});

test("maps pull-request identity through the Octokit REST endpoint", async (t) => {
  let capturedUrl = "";
  mockFetch(t, async (input) => {
    capturedUrl = String(input);
    return jsonResponse(
      {
        base: { sha: "a".repeat(40) },
        head: { sha: "b".repeat(40) },
        html_url: "https://github.com/owner/repository/pull/42",
        number: 42,
        state: "open",
        draft: false,
      },
      { status: 200 },
    );
  });
  const client = new GitHubClient("token", "owner/repository");

  const pullRequest = await client.getPullRequest(42);

  assert.equal(
    capturedUrl,
    "https://api.github.com/repos/owner/repository/pulls/42",
  );
  assert.deepEqual(pullRequest, {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    htmlUrl: "https://github.com/owner/repository/pull/42",
    number: 42,
    state: "open",
    isDraft: false,
  });
});

test("preserves paginated review identity and rejects later-page errors", async (t) => {
  let requestCount = 0;
  let failLaterPage = false;
  mockFetch(t, async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return jsonResponse(
        [
          {
            body: "",
            commit_id: "b".repeat(40),
            id: 11,
            state: "COMMENTED",
            submitted_at: "2026-09-02T10:00:30Z",
            user: { login: "github-actions[bot]" },
          },
        ],
        {
          headers: {
            Link: '<https://api.github.com/repositories/1/pulls/42/reviews?page=2>; rel="next"',
          },
          status: 200,
        },
      );
    }
    if (failLaterPage)
      return jsonResponse({ message: "denied" }, { status: 403 });
    return jsonResponse(
      [
        {
          body: null,
          commit_id: "c".repeat(40),
          id: 12,
          state: "DISMISSED",
          submitted_at: "2026-09-02T09:00:00Z",
          user: null,
        },
      ],
      { status: 200 },
    );
  });
  const client = new GitHubClient("token", "owner/repository");

  const reviews = await client.listReviews(42);

  assert.equal(requestCount, 2);
  assert.deepEqual(reviews, [
    {
      authorLogin: "github-actions[bot]",
      body: "",
      commitSha: "b".repeat(40),
      id: 11,
      state: "COMMENTED",
      submittedAt: "2026-09-02T10:00:30Z",
    },
    {
      authorLogin: null,
      body: null,
      commitSha: "c".repeat(40),
      id: 12,
      state: "DISMISSED",
      submittedAt: "2026-09-02T09:00:00Z",
    },
  ]);
  requestCount = 0;
  failLaterPage = true;
  await assert.rejects(client.listReviews(42), /denied/u);
  assert.equal(requestCount, 2);
});

test("paginates inline review comments and preserves their review identity", async (t) => {
  let requestCount = 0;
  mockFetch(t, async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return jsonResponse(
        [
          {
            body: "**[high] Unsafe change**",
            id: 501,
            pull_request_review_id: 99,
          },
        ],
        {
          headers: {
            Link: '<https://api.github.com/repositories/1/pulls/42/comments?page=2>; rel="next"',
          },
          status: 200,
        },
      );
    }
    return jsonResponse(
      [
        {
          body: "**[low] Clarify this**",
          id: 502,
          pull_request_review_id: 100,
        },
      ],
      { status: 200 },
    );
  });
  const client = new GitHubClient("token", "owner/repository");

  assert.deepEqual(await client.listReviewComments(42), [
    { body: "**[high] Unsafe change**", id: 501, reviewId: 99 },
    { body: "**[low] Clarify this**", id: 502, reviewId: 100 },
  ]);
  assert.equal(requestCount, 2);
});
