import type { Octokit } from "@octokit/rest";
import { githubClient, toActionableError } from "./github-client.js";

export interface IssuesOctokit {
  rest: {
    issues: Pick<Octokit["rest"]["issues"], "listForRepo" | "get" | "listComments" | "create" | "createComment" | "update">;
    search: Pick<Octokit["rest"]["search"], "issuesAndPullRequests">;
  };
}

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: string[];
  assignees: string[];
  updated_at: string;
}

function toSummary(issue: any): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    html_url: issue.html_url,
    labels: (issue.labels ?? []).map((l: any) => (typeof l === "string" ? l : l.name)),
    assignees: (issue.assignees ?? []).map((a: any) => a.login),
    updated_at: issue.updated_at,
  };
}

export async function listIssues(
  owner: string,
  repo: string,
  opts: { state?: "open" | "closed" | "all"; labels?: string[]; assignee?: string; per_page?: number } = {},
  client: IssuesOctokit = githubClient(owner),
): Promise<IssueSummary[]> {
  try {
    const { data } = await client.rest.issues.listForRepo({
      owner,
      repo,
      state: opts.state ?? "open",
      labels: opts.labels?.join(","),
      assignee: opts.assignee,
      per_page: opts.per_page ?? 30,
    });
    return data.filter((issue: any) => !issue.pull_request).map(toSummary);
  } catch (err) {
    throw toActionableError(err, "listing issues");
  }
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  includeComments = false,
  client: IssuesOctokit = githubClient(owner),
): Promise<IssueSummary & { body: string | null; comments?: Array<{ author: string; body: string; created_at: string }> }> {
  try {
    const { data: issue } = await client.rest.issues.get({ owner, repo, issue_number: issueNumber });
    const result = { ...toSummary(issue), body: issue.body ?? null } as IssueSummary & {
      body: string | null;
      comments?: Array<{ author: string; body: string; created_at: string }>;
    };
    if (includeComments) {
      const { data: comments } = await client.rest.issues.listComments({ owner, repo, issue_number: issueNumber });
      result.comments = comments.map((c: any) => ({ author: c.user?.login ?? "unknown", body: c.body ?? "", created_at: c.created_at }));
    }
    return result;
  } catch (err) {
    throw toActionableError(err, `fetching issue #${issueNumber}`);
  }
}

export async function searchIssuesAndPrs(
  query: string,
  owner?: string,
  repo?: string,
  client: IssuesOctokit = githubClient(owner),
): Promise<Array<{ number: number; title: string; state: string; html_url: string; repository_url: string; is_pull_request: boolean }>> {
  const fullQuery = owner && repo ? `repo:${owner}/${repo} ${query}` : query;
  try {
    const { data } = await client.rest.search.issuesAndPullRequests({ q: fullQuery });
    return data.items.map((item: any) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      html_url: item.html_url,
      repository_url: item.repository_url,
      is_pull_request: Boolean(item.pull_request),
    }));
  } catch (err) {
    throw toActionableError(err, "searching issues and pull requests");
  }
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[],
  assignees?: string[],
  client: IssuesOctokit = githubClient(owner),
): Promise<IssueSummary> {
  try {
    const { data } = await client.rest.issues.create({ owner, repo, title, body, labels, assignees });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, "creating issue");
  }
}

export async function commentOnIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  client: IssuesOctokit = githubClient(owner),
): Promise<{ id: number; html_url: string }> {
  try {
    const { data } = await client.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
    return { id: data.id, html_url: data.html_url };
  } catch (err) {
    throw toActionableError(err, `commenting on issue #${issueNumber}`);
  }
}

export async function updateIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  opts: { title?: string; body?: string; state?: "open" | "closed"; labels?: string[]; assignees?: string[] },
  client: IssuesOctokit = githubClient(owner),
): Promise<IssueSummary> {
  try {
    const { data } = await client.rest.issues.update({ owner, repo, issue_number: issueNumber, ...opts });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, `updating issue #${issueNumber}`);
  }
}

export async function closeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  comment?: string,
  reason?: "completed" | "not_planned",
  client: IssuesOctokit = githubClient(owner),
): Promise<IssueSummary> {
  try {
    if (comment) {
      await client.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: comment });
    }
    const { data } = await client.rest.issues.update({ owner, repo, issue_number: issueNumber, state: "closed", state_reason: reason });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, `closing issue #${issueNumber}`);
  }
}
