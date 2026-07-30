import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listPullRequests,
  getPullRequest,
  createPullRequest,
  reviewPullRequest,
  getPullRequestChecks,
  mergePullRequest,
  closePullRequest,
  getPullRequestReviewComment,
  listPullRequestReviewComments,
  updatePullRequest,
  requestPullRequestReviewers,
} from "../pull-requests.js";
import { ok, fail } from "../tool-helpers.js";

export function registerPullRequestTools(server: McpServer): void {
  server.registerTool(
    "list_pull_requests",
    {
      description: "List pull requests in a GitHub repository. Defaults to open pull requests.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state (default 'open')"),
        base: z.string().optional().describe("Filter by base branch"),
        head: z.string().optional().describe("Filter by head branch, or 'org:branch' for a fork"),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page (default 30, max 100)"),
      },
    },
    async ({ owner, repo, state, base, head, per_page }) => {
      try {
        return ok(await listPullRequests(owner, repo, { state, base, head, per_page }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_pull_request",
    {
      description: "Get the full detail of a single pull request, including diff stats and mergeability.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
      },
    },
    async ({ owner, repo, pull_number }) => {
      try {
        return ok(await getPullRequest(owner, repo, pull_number));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_pull_request",
    {
      description: "Open a new pull request.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        title: z.string().min(1).describe("Pull request title"),
        head: z.string().describe("Branch containing the changes, or 'org:branch' for a fork"),
        base: z.string().describe("Branch to merge into"),
        body: z.string().optional().describe("Pull request description (markdown)"),
        draft: z.boolean().optional().describe("Open as a draft pull request"),
      },
    },
    async ({ owner, repo, title, head, base, body, draft }) => {
      try {
        return ok(await createPullRequest(owner, repo, title, head, base, body, draft));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "review_pull_request",
    {
      description:
        "Submit a review on a pull request (approve, request changes, or comment). A body is required unless approving.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).describe("Review verdict"),
        body: z.string().optional().describe("Review comment body (required unless event is APPROVE)"),
      },
    },
    async ({ owner, repo, pull_number, event, body }) => {
      try {
        return ok(await reviewPullRequest(owner, repo, pull_number, event, body));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_pull_request_checks",
    {
      description:
        "Get CI check run statuses for a pull request's latest commit. Use this before merging to confirm CI is passing.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
      },
    },
    async ({ owner, repo, pull_number }) => {
      try {
        return ok(await getPullRequestChecks(owner, repo, pull_number));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "merge_pull_request",
    {
      description:
        "Merge a pull request. Irreversible — requires confirm: true. Check get_pull_request_checks first to verify CI is passing.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
        merge_method: z.enum(["merge", "squash", "rebase"]).optional().describe("Merge strategy (default: repository default)"),
        commit_title: z.string().optional().describe("Custom merge commit title"),
        commit_message: z.string().optional().describe("Custom merge commit message"),
        confirm: z.literal(true).describe("Must be exactly true to confirm this irreversible merge"),
      },
    },
    async ({ owner, repo, pull_number, merge_method, commit_title, commit_message, confirm }) => {
      try {
        return ok(await mergePullRequest(owner, repo, pull_number, confirm, { merge_method, commit_title, commit_message }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_pull_request_review_comment",
    {
      description:
        "Get a single inline review comment on a pull request by its comment ID (the numeric ID in a GitHub PR discussion URL, e.g. '#discussion_r1234567890' -> 1234567890).",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        comment_id: z.number().int().describe("Review comment ID (from a '#discussion_r<id>' URL fragment)"),
      },
    },
    async ({ owner, repo, comment_id }) => {
      try {
        return ok(await getPullRequestReviewComment(owner, repo, comment_id));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_pull_request_review_comments",
    {
      description: "List all inline review (diff) comments on a pull request.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
      },
    },
    async ({ owner, repo, pull_number }) => {
      try {
        return ok(await listPullRequestReviewComments(owner, repo, pull_number));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_pull_request",
    {
      description: "Update an existing pull request's title, body, base branch, or state.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
        title: z.string().min(1).optional().describe("New title"),
        body: z.string().optional().describe("New body (markdown)"),
        base: z.string().optional().describe("New base branch"),
        state: z.enum(["open", "closed"]).optional().describe("New state"),
      },
    },
    async ({ owner, repo, pull_number, title, body, base, state }) => {
      try {
        return ok(await updatePullRequest(owner, repo, pull_number, { title, body, base, state }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "request_pull_request_reviewers",
    {
      description: "Request review from users and/or teams on a pull request.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
        reviewers: z.array(z.string()).optional().describe("Usernames to request review from"),
        team_reviewers: z.array(z.string()).optional().describe("Team slugs to request review from"),
      },
    },
    async ({ owner, repo, pull_number, reviewers, team_reviewers }) => {
      try {
        return ok(await requestPullRequestReviewers(owner, repo, pull_number, reviewers, team_reviewers));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "close_pull_request",
    {
      description: "Close a pull request without merging, optionally leaving a comment first.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().int().describe("Pull request number"),
        comment: z.string().optional().describe("Comment to post before closing"),
      },
    },
    async ({ owner, repo, pull_number, comment }) => {
      try {
        return ok(await closePullRequest(owner, repo, pull_number, comment));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
