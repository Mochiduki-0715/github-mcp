import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listIssues, getIssue, searchIssuesAndPrs, createIssue, commentOnIssue, updateIssue, closeIssue } from "../issues.js";
import { ok, fail } from "../tool-helpers.js";

export function registerIssueTools(server: McpServer): void {
  server.registerTool(
    "list_issues",
    {
      description: "List issues in a GitHub repository (excludes pull requests). Defaults to open issues.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state (default 'open')"),
        labels: z.array(z.string()).optional().describe("Filter by label names"),
        assignee: z.string().optional().describe("Filter by assignee username"),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page (default 30, max 100)"),
      },
    },
    async ({ owner, repo, state, labels, assignee, per_page }) => {
      try {
        return ok(await listIssues(owner, repo, { state, labels, assignee, per_page }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_issue",
    {
      description: "Get the full detail of a single issue, optionally including its comment thread.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        issue_number: z.number().int().describe("Issue number"),
        include_comments: z.boolean().optional().describe("Also fetch the comment thread (default false)"),
      },
    },
    async ({ owner, repo, issue_number, include_comments }) => {
      try {
        return ok(await getIssue(owner, repo, issue_number, include_comments ?? false));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "search_issues_and_prs",
    {
      description:
        "Search issues and pull requests by keyword using GitHub's search API. Useful when the exact owner/repo isn't known, or to search across a whole repository.",
      inputSchema: {
        query: z.string().describe("Search query (GitHub search syntax, e.g. 'is:open label:bug')"),
        owner: z.string().optional().describe("Restrict search to this repository owner (requires repo too)"),
        repo: z.string().optional().describe("Restrict search to this repository (requires owner too)"),
      },
    },
    async ({ query, owner, repo }) => {
      try {
        return ok(await searchIssuesAndPrs(query, owner, repo));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_issue",
    {
      description: "Open a new issue in a GitHub repository.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        title: z.string().min(1).describe("Issue title"),
        body: z.string().optional().describe("Issue body (markdown)"),
        labels: z.array(z.string()).optional().describe("Labels to apply"),
        assignees: z.array(z.string()).optional().describe("Usernames to assign"),
      },
    },
    async ({ owner, repo, title, body, labels, assignees }) => {
      try {
        return ok(await createIssue(owner, repo, title, body, labels, assignees));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "comment_on_issue",
    {
      description: "Add a comment to an issue or pull request.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        issue_number: z.number().int().describe("Issue (or pull request) number"),
        body: z.string().min(1).describe("Comment body (markdown)"),
      },
    },
    async ({ owner, repo, issue_number, body }) => {
      try {
        return ok(await commentOnIssue(owner, repo, issue_number, body));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_issue",
    {
      description:
        "Update an existing issue's title, body, state, labels, or assignees. When provided, 'labels'/'assignees' fully replace the existing set.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        issue_number: z.number().int().describe("Issue number"),
        title: z.string().min(1).optional().describe("New title"),
        body: z.string().optional().describe("New body (markdown)"),
        state: z.enum(["open", "closed"]).optional().describe("New state"),
        labels: z.array(z.string()).optional().describe("Replaces the full label set"),
        assignees: z.array(z.string()).optional().describe("Replaces the full assignee set"),
      },
    },
    async ({ owner, repo, issue_number, title, body, state, labels, assignees }) => {
      try {
        return ok(await updateIssue(owner, repo, issue_number, { title, body, state, labels, assignees }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "close_issue",
    {
      description: "Close an issue, optionally leaving a closing comment first.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        issue_number: z.number().int().describe("Issue number"),
        comment: z.string().optional().describe("Comment to post before closing"),
        reason: z.enum(["completed", "not_planned"]).optional().describe("Closing reason"),
      },
    },
    async ({ owner, repo, issue_number, comment, reason }) => {
      try {
        return ok(await closeIssue(owner, repo, issue_number, comment, reason));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
