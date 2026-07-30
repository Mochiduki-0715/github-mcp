import type { Octokit } from "@octokit/rest";
import { githubClient, toActionableError } from "./github-client.js";

export interface PullRequestsOctokit {
  rest: {
    pulls: Pick<
      Octokit["rest"]["pulls"],
      "list" | "get" | "create" | "createReview" | "merge" | "update" | "getReviewComment" | "listReviewComments" | "requestReviewers"
    >;
    checks: Pick<Octokit["rest"]["checks"], "listForRef">;
    issues: Pick<Octokit["rest"]["issues"], "createComment">;
  };
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  head: string;
  base: string;
  updated_at: string;
}

function toSummary(pr: any): PullRequestSummary {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: Boolean(pr.draft),
    html_url: pr.html_url,
    head: pr.head?.ref,
    base: pr.base?.ref,
    updated_at: pr.updated_at,
  };
}

export async function listPullRequests(
  owner: string,
  repo: string,
  opts: { state?: "open" | "closed" | "all"; base?: string; head?: string; per_page?: number } = {},
  client: PullRequestsOctokit = githubClient(owner),
): Promise<PullRequestSummary[]> {
  try {
    const { data } = await client.rest.pulls.list({
      owner,
      repo,
      state: opts.state ?? "open",
      base: opts.base,
      head: opts.head,
      per_page: opts.per_page ?? 30,
    });
    return data.map(toSummary);
  } catch (err) {
    throw toActionableError(err, "listing pull requests");
  }
}

export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<PullRequestSummary & { body: string | null; additions: number; deletions: number; changed_files: number; mergeable: boolean | null }> {
  try {
    const { data } = await client.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    return {
      ...toSummary(data),
      body: data.body ?? null,
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
      mergeable: data.mergeable,
    };
  } catch (err) {
    throw toActionableError(err, `fetching pull request #${pullNumber}`);
  }
}

export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string,
  draft?: boolean,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<PullRequestSummary> {
  try {
    const { data } = await client.rest.pulls.create({ owner, repo, title, head, base, body, draft });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, "creating pull request");
  }
}

export async function reviewPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<{ id: number; state: string }> {
  if (event !== "APPROVE" && !body) {
    throw new Error(`review_pull_request requires a 'body' when event is '${event}'.`);
  }
  try {
    const { data } = await client.rest.pulls.createReview({ owner, repo, pull_number: pullNumber, event, body });
    return { id: data.id, state: data.state };
  } catch (err) {
    throw toActionableError(err, `reviewing pull request #${pullNumber}`);
  }
}

export interface CheckRunSummary {
  name: string;
  status: string;
  conclusion: string | null;
  url: string | null;
}

export async function getPullRequestChecks(
  owner: string,
  repo: string,
  pullNumber: number,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<CheckRunSummary[]> {
  try {
    const { data: pr } = await client.rest.pulls.get({ owner, repo, pull_number: pullNumber });
    const { data } = await client.rest.checks.listForRef({ owner, repo, ref: pr.head.sha });
    return data.check_runs.map((run: any) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      url: run.html_url,
    }));
  } catch (err) {
    throw toActionableError(err, `fetching checks for pull request #${pullNumber}`);
  }
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  confirm: boolean,
  opts: { merge_method?: "merge" | "squash" | "rebase"; commit_title?: string; commit_message?: string } = {},
  client: PullRequestsOctokit = githubClient(owner),
): Promise<{ merged: boolean; sha: string; message: string }> {
  if (confirm !== true) {
    throw new Error("merge_pull_request requires confirm: true — merging is irreversible.");
  }
  try {
    const { data } = await client.rest.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: opts.merge_method,
      commit_title: opts.commit_title,
      commit_message: opts.commit_message,
    });
    return { merged: data.merged, sha: data.sha, message: data.message };
  } catch (err) {
    throw toActionableError(err, `merging pull request #${pullNumber}`);
  }
}

export interface ReviewCommentSummary {
  id: number;
  user: string | undefined;
  body: string;
  path: string;
  line: number | null;
  diff_hunk: string;
  in_reply_to_id: number | undefined;
  html_url: string;
  created_at: string;
}

function toReviewCommentSummary(c: any): ReviewCommentSummary {
  return {
    id: c.id,
    user: c.user?.login,
    body: c.body,
    path: c.path,
    line: c.line ?? c.original_line ?? null,
    diff_hunk: c.diff_hunk,
    in_reply_to_id: c.in_reply_to_id,
    html_url: c.html_url,
    created_at: c.created_at,
  };
}

export async function getPullRequestReviewComment(
  owner: string,
  repo: string,
  commentId: number,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<ReviewCommentSummary> {
  try {
    const { data } = await client.rest.pulls.getReviewComment({ owner, repo, comment_id: commentId });
    return toReviewCommentSummary(data);
  } catch (err) {
    throw toActionableError(err, `fetching review comment #${commentId}`);
  }
}

export async function listPullRequestReviewComments(
  owner: string,
  repo: string,
  pullNumber: number,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<ReviewCommentSummary[]> {
  try {
    const { data } = await client.rest.pulls.listReviewComments({ owner, repo, pull_number: pullNumber, per_page: 100 });
    return data.map(toReviewCommentSummary);
  } catch (err) {
    throw toActionableError(err, `listing review comments for pull request #${pullNumber}`);
  }
}

export async function updatePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  opts: { title?: string; body?: string; base?: string; state?: "open" | "closed" },
  client: PullRequestsOctokit = githubClient(owner),
): Promise<PullRequestSummary> {
  try {
    const { data } = await client.rest.pulls.update({ owner, repo, pull_number: pullNumber, ...opts });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, `updating pull request #${pullNumber}`);
  }
}

export async function requestPullRequestReviewers(
  owner: string,
  repo: string,
  pullNumber: number,
  reviewers?: string[],
  teamReviewers?: string[],
  client: PullRequestsOctokit = githubClient(owner),
): Promise<{ requested_reviewers: string[]; requested_teams: string[] }> {
  if (!reviewers?.length && !teamReviewers?.length) {
    throw new Error("request_pull_request_reviewers requires at least one of 'reviewers' or 'team_reviewers'.");
  }
  try {
    const { data } = await client.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
      team_reviewers: teamReviewers,
    });
    return {
      requested_reviewers: (data.requested_reviewers ?? []).map((u: any) => u.login),
      requested_teams: (data.requested_teams ?? []).map((t: any) => t.slug),
    };
  } catch (err) {
    throw toActionableError(err, `requesting reviewers on pull request #${pullNumber}`);
  }
}

export async function closePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  comment?: string,
  client: PullRequestsOctokit = githubClient(owner),
): Promise<PullRequestSummary> {
  try {
    if (comment) {
      await client.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body: comment });
    }
    const { data } = await client.rest.pulls.update({ owner, repo, pull_number: pullNumber, state: "closed" });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, `closing pull request #${pullNumber}`);
  }
}
