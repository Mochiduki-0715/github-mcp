import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { syncGithubToVault, syncVaultToGithub } from "../sync.js";
import { ok, fail } from "../tool-helpers.js";

export function registerSyncTools(server: McpServer): void {
  server.registerTool(
    "sync_github_to_vault",
    {
      description:
        "Sync GitHub issues (and optionally pull requests) from one or more repositories into the Obsidian vault as notes under GitHub/<owner>/<repo>/Issues|PRs/<number>.md. Idempotent: unchanged issues are skipped, and any content under a '## My Notes' heading is preserved across re-syncs.",
      inputSchema: {
        repos: z.array(z.object({ owner: z.string(), repo: z.string() })).min(1).describe("Repositories to sync"),
        state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state (default 'open')"),
        include_prs: z.boolean().optional().describe("Also sync pull requests (default false)"),
      },
    },
    async ({ repos, state, include_prs }) => {
      try {
        return ok(await syncGithubToVault(repos, { state, include_prs }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "sync_vault_to_github",
    {
      description:
        "Scan the vault (or a subfolder) for notes with frontmatter 'github_sync: create_issue' and no 'github_number' yet, create a GitHub issue for each using their 'github_owner'/'github_repo' frontmatter, and write the resulting issue number/url back into the note's frontmatter to prevent duplicate creation.",
      inputSchema: {
        folder: z.string().optional().describe("Vault-relative subfolder to scan (omit for the whole vault)"),
      },
    },
    async ({ folder }) => {
      try {
        return ok(await syncVaultToGithub(folder));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
