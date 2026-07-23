import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { gitStatus, gitDiff, createBranch, commitChanges, pushBranch } from "../local-git.js";
import { ok, fail } from "../tool-helpers.js";

export function registerLocalGitTools(server: McpServer): void {
  server.registerTool(
    "git_status",
    {
      description: "Show staged, modified, and untracked files in a local git repository. Read-only.",
      inputSchema: {
        repo_path: z.string().describe("Absolute or relative path to a local git repository"),
      },
    },
    async ({ repo_path }) => {
      try {
        return ok(await gitStatus(repo_path));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "git_diff",
    {
      description: "Show a diff of changes in a local git repository. Read-only. Large diffs are truncated.",
      inputSchema: {
        repo_path: z.string().describe("Absolute or relative path to a local git repository"),
        staged: z.boolean().optional().describe("Show staged (--cached) changes instead of the working tree diff"),
        files: z.array(z.string()).optional().describe("Restrict the diff to these paths"),
      },
    },
    async ({ repo_path, staged, files }) => {
      try {
        return ok(await gitDiff(repo_path, staged ?? false, files));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "create_branch",
    {
      description: "Create a new local branch and switch to it. Fails if the branch already exists.",
      inputSchema: {
        repo_path: z.string().describe("Absolute or relative path to a local git repository"),
        branch_name: z.string().min(1).describe("Name of the new branch"),
        from: z.string().optional().describe("Branch/ref to base the new branch on (default: current HEAD)"),
      },
    },
    async ({ repo_path, branch_name, from }) => {
      try {
        return ok(await createBranch(repo_path, branch_name, from));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "commit_changes",
    {
      description:
        "Stage and commit local changes. Uses the repository's existing git config for author/committer — never injects an AI identity or trailer. Refuses to commit directly on a protected branch (main/master/develop/dev by default).",
      inputSchema: {
        repo_path: z.string().describe("Absolute or relative path to a local git repository"),
        message: z.string().min(1).describe("Commit message, used verbatim"),
        files: z.array(z.string()).optional().describe("Specific paths to stage (omit to use stage_all)"),
        stage_all: z.boolean().optional().describe("Stage all changes (git add -A) instead of specific files"),
      },
    },
    async ({ repo_path, message, files, stage_all }) => {
      try {
        return ok(await commitChanges(repo_path, message, files, stage_all ?? false));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "push_branch",
    {
      description:
        "Push a branch to a remote. For HTTPS remotes, injects the GitHub token for a single git invocation only (never persisted to .git/config). Never force-pushes. Refuses to push a protected branch (main/master/develop/dev by default).",
      inputSchema: {
        repo_path: z.string().describe("Absolute or relative path to a local git repository"),
        remote: z.string().optional().describe("Remote name (default 'origin')"),
        branch: z.string().optional().describe("Branch to push (default: current branch)"),
      },
    },
    async ({ repo_path, remote, branch }) => {
      try {
        return ok(await pushBranch(repo_path, remote ?? "origin", branch));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
