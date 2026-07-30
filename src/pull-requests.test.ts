import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  listPullRequests,
  getPullRequest,
  reviewPullRequest,
  getPullRequestChecks,
  mergePullRequest,
  closePullRequest,
  getPullRequestReviewComment,
  listPullRequestReviewComments,
  updatePullRequest,
  requestPullRequestReviewers,
  type PullRequestsOctokit,
} from "./pull-requests.js";

function fakePr(overrides: Partial<any> = {}) {
  return {
    number: 1,
    title: "Test PR",
    state: "open",
    draft: false,
    html_url: "https://github.com/o/r/pull/1",
    head: { ref: "feature", sha: "abc123" },
    base: { ref: "main" },
    updated_at: "2026-01-01T00:00:00Z",
    body: "body",
    additions: 1,
    deletions: 0,
    changed_files: 1,
    mergeable: true,
    ...overrides,
  };
}

describe("listPullRequests", () => {
  test("maps summaries", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { list: (async () => ({ data: [fakePr()] })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const prs = await listPullRequests("o", "r", {}, client);
    assert.equal(prs.length, 1);
    assert.equal(prs[0].head, "feature");
  });
});

describe("getPullRequest", () => {
  test("returns detail including diff stats", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { get: (async () => ({ data: fakePr() })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const pr = await getPullRequest("o", "r", 1, client);
    assert.equal(pr.additions, 1);
    assert.equal(pr.mergeable, true);
  });
});

describe("reviewPullRequest", () => {
  test("throws when body missing for REQUEST_CHANGES", async () => {
    const client: PullRequestsOctokit = { rest: { pulls: {} as any, checks: {} as any, issues: {} as any } };
    await assert.rejects(() => reviewPullRequest("o", "r", 1, "REQUEST_CHANGES", undefined, client), /requires a 'body'/);
  });

  test("throws when body missing for COMMENT", async () => {
    const client: PullRequestsOctokit = { rest: { pulls: {} as any, checks: {} as any, issues: {} as any } };
    await assert.rejects(() => reviewPullRequest("o", "r", 1, "COMMENT", undefined, client), /requires a 'body'/);
  });

  test("allows APPROVE without body", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { createReview: (async () => ({ data: { id: 1, state: "APPROVED" } })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const result = await reviewPullRequest("o", "r", 1, "APPROVE", undefined, client);
    assert.equal(result.state, "APPROVED");
  });
});

describe("getPullRequestChecks", () => {
  test("resolves head sha then fetches check runs", async () => {
    let capturedRef = "";
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { get: (async () => ({ data: fakePr() })) as any } as any,
        checks: {
          listForRef: (async (params: any) => {
            capturedRef = params.ref;
            return { data: { check_runs: [{ name: "build", status: "completed", conclusion: "success", html_url: "u" }] } };
          }) as any,
        },
        issues: {} as any,
      },
    };
    const checks = await getPullRequestChecks("o", "r", 1, client);
    assert.equal(capturedRef, "abc123");
    assert.equal(checks[0].name, "build");
    assert.equal(checks[0].conclusion, "success");
  });
});

describe("mergePullRequest", () => {
  test("throws without confirm: true", async () => {
    const client: PullRequestsOctokit = { rest: { pulls: {} as any, checks: {} as any, issues: {} as any } };
    await assert.rejects(() => mergePullRequest("o", "r", 1, false, {}, client), /requires confirm: true/);
  });

  test("merges when confirm is true", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { merge: (async () => ({ data: { merged: true, sha: "abc", message: "Merged" } })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const result = await mergePullRequest("o", "r", 1, true, {}, client);
    assert.equal(result.merged, true);
  });
});

function fakeReviewComment(overrides: Partial<any> = {}) {
  return {
    id: 3642374894,
    user: { login: "reviewer" },
    body: "Please fix this.",
    path: "src/app/foo.php",
    line: 42,
    diff_hunk: "@@ -1,3 +1,3 @@",
    in_reply_to_id: undefined,
    html_url: "https://github.com/o/r/pull/1#discussion_r3642374894",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getPullRequestReviewComment", () => {
  test("maps a single review comment", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { getReviewComment: (async () => ({ data: fakeReviewComment() })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const comment = await getPullRequestReviewComment("o", "r", 3642374894, client);
    assert.equal(comment.id, 3642374894);
    assert.equal(comment.user, "reviewer");
    assert.equal(comment.path, "src/app/foo.php");
  });
});

describe("listPullRequestReviewComments", () => {
  test("maps a list of review comments", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { listReviewComments: (async () => ({ data: [fakeReviewComment()] })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const comments = await listPullRequestReviewComments("o", "r", 1, client);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].body, "Please fix this.");
  });
});

describe("updatePullRequest", () => {
  test("returns a summary reflecting the update", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: { update: (async () => ({ data: fakePr({ title: "Updated title", base: { ref: "develop" } }) })) as any } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const pr = await updatePullRequest("o", "r", 1, { title: "Updated title", base: "develop" }, client);
    assert.equal(pr.title, "Updated title");
    assert.equal(pr.base, "develop");
  });
});

describe("requestPullRequestReviewers", () => {
  test("maps requested reviewers and teams", async () => {
    const client: PullRequestsOctokit = {
      rest: {
        pulls: {
          requestReviewers: (async () => ({
            data: { requested_reviewers: [{ login: "alice" }], requested_teams: [{ slug: "core" }] },
          })) as any,
        } as any,
        checks: {} as any,
        issues: {} as any,
      },
    };
    const result = await requestPullRequestReviewers("o", "r", 1, ["alice"], undefined, client);
    assert.deepEqual(result.requested_reviewers, ["alice"]);
    assert.deepEqual(result.requested_teams, ["core"]);
  });

  test("throws when neither reviewers nor team_reviewers given", async () => {
    const client: PullRequestsOctokit = { rest: { pulls: {} as any, checks: {} as any, issues: {} as any } };
    await assert.rejects(
      () => requestPullRequestReviewers("o", "r", 1, undefined, undefined, client),
      /requires at least one of/,
    );
  });
});

describe("closePullRequest", () => {
  test("comments before closing when comment given", async () => {
    const calls: string[] = [];
    const client: PullRequestsOctokit = {
      rest: {
        pulls: {
          update: (async () => {
            calls.push("update");
            return { data: fakePr({ state: "closed" }) };
          }) as any,
        } as any,
        checks: {} as any,
        issues: {
          createComment: (async () => {
            calls.push("comment");
            return { data: {} };
          }) as any,
        },
      },
    };
    const pr = await closePullRequest("o", "r", 1, "closing", client);
    assert.deepEqual(calls, ["comment", "update"]);
    assert.equal(pr.state, "closed");
  });
});
