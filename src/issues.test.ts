import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listIssues, getIssue, createIssue, closeIssue, searchIssuesAndPrs, type IssuesOctokit } from "./issues.js";

function fakeIssue(overrides: Partial<any> = {}) {
  return {
    number: 1,
    title: "Test issue",
    state: "open",
    html_url: "https://github.com/o/r/issues/1",
    labels: [],
    assignees: [],
    updated_at: "2026-01-01T00:00:00Z",
    body: "body text",
    ...overrides,
  };
}

describe("listIssues", () => {
  test("filters out entries with a pull_request field", async () => {
    const client: IssuesOctokit = {
      rest: {
        issues: {
          listForRepo: (async () => ({
            data: [fakeIssue({ number: 1 }), fakeIssue({ number: 2, pull_request: { url: "x" } })],
          })) as any,
        } as any,
        search: {} as any,
      },
    };
    const issues = await listIssues("o", "r", {}, client);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].number, 1);
  });
});

describe("getIssue", () => {
  test("includes comments only when requested", async () => {
    const client: IssuesOctokit = {
      rest: {
        issues: {
          get: (async () => ({ data: fakeIssue() })) as any,
          listComments: (async () => ({ data: [{ user: { login: "alice" }, body: "hi", created_at: "2026-01-02T00:00:00Z" }] })) as any,
        } as any,
        search: {} as any,
      },
    };
    const withoutComments = await getIssue("o", "r", 1, false, client);
    assert.equal(withoutComments.comments, undefined);

    const withComments = await getIssue("o", "r", 1, true, client);
    assert.equal(withComments.comments?.length, 1);
    assert.equal(withComments.comments?.[0].author, "alice");
  });
});

describe("searchIssuesAndPrs", () => {
  test("prefixes query with repo: when owner/repo given", async () => {
    let capturedQuery = "";
    const client: IssuesOctokit = {
      rest: {
        issues: {} as any,
        search: {
          issuesAndPullRequests: (async (params: any) => {
            capturedQuery = params.q;
            return { data: { items: [] } };
          }) as any,
        },
      },
    };
    await searchIssuesAndPrs("bug", "o", "r", client);
    assert.equal(capturedQuery, "repo:o/r bug");
  });

  test("marks pull requests via the pull_request field", async () => {
    const client: IssuesOctokit = {
      rest: {
        issues: {} as any,
        search: {
          issuesAndPullRequests: (async () => ({
            data: {
              items: [
                { number: 1, title: "issue", state: "open", html_url: "u1", repository_url: "ru1" },
                { number: 2, title: "pr", state: "open", html_url: "u2", repository_url: "ru2", pull_request: { url: "x" } },
              ],
            },
          })) as any,
        },
      },
    };
    const results = await searchIssuesAndPrs("test", undefined, undefined, client);
    assert.equal(results[0].is_pull_request, false);
    assert.equal(results[1].is_pull_request, true);
  });
});

describe("createIssue", () => {
  test("returns a summary of the created issue", async () => {
    const client: IssuesOctokit = {
      rest: {
        issues: { create: (async () => ({ data: fakeIssue({ number: 5, title: "New" }) })) as any } as any,
        search: {} as any,
      },
    };
    const issue = await createIssue("o", "r", "New", undefined, undefined, undefined, client);
    assert.equal(issue.number, 5);
    assert.equal(issue.title, "New");
  });
});

describe("closeIssue", () => {
  test("comments before closing when a comment is given", async () => {
    const calls: string[] = [];
    const client: IssuesOctokit = {
      rest: {
        issues: {
          createComment: (async () => {
            calls.push("comment");
            return { data: {} };
          }) as any,
          update: (async () => {
            calls.push("update");
            return { data: fakeIssue({ state: "closed" }) };
          }) as any,
        } as any,
        search: {} as any,
      },
    };
    const issue = await closeIssue("o", "r", 1, "closing now", "completed", client);
    assert.deepEqual(calls, ["comment", "update"]);
    assert.equal(issue.state, "closed");
  });

  test("skips commenting when no comment is given", async () => {
    const calls: string[] = [];
    const client: IssuesOctokit = {
      rest: {
        issues: {
          createComment: (async () => {
            calls.push("comment");
            return { data: {} };
          }) as any,
          update: (async () => {
            calls.push("update");
            return { data: fakeIssue({ state: "closed" }) };
          }) as any,
        } as any,
        search: {} as any,
      },
    };
    await closeIssue("o", "r", 1, undefined, undefined, client);
    assert.deepEqual(calls, ["update"]);
  });
});
