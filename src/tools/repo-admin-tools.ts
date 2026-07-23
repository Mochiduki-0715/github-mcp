import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRepository, listBranches, setBranchProtection, updateRepositorySettings, getRateLimit } from "../repo-admin.js";
import { ok, fail } from "../tool-helpers.js";

export function registerRepoAdminTools(server: McpServer): void {
  server.registerTool(
    "create_repository",
    {
      description: "Create a new GitHub repository, either for the authenticated user or inside an organization.",
      inputSchema: {
        name: z.string().min(1).describe("Repository name"),
        org: z.string().optional().describe("Organization to create the repository in (omit for a personal repository)"),
        account: z.string().optional().describe("Which account's token to use (defaults to 'org', then the default GITHUB_TOKEN)"),
        private: z.boolean().optional().describe("Create as private (default true)"),
        description: z.string().optional().describe("Repository description"),
        auto_init: z.boolean().optional().describe("Initialize with a README (default true)"),
        gitignore_template: z.string().optional().describe("gitignore template name, e.g. 'Node'"),
        license_template: z.string().optional().describe("license template key, e.g. 'mit'"),
      },
    },
    async ({ name, org, account, private: isPrivate, description, auto_init, gitignore_template, license_template }) => {
      try {
        return ok(await createRepository(name, { org, account, private: isPrivate, description, auto_init, gitignore_template, license_template }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_branches",
    {
      description: "List branches in a repository, including which are protected.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ owner, repo }) => {
      try {
        return ok(await listBranches(owner, repo));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "set_branch_protection",
    {
      description:
        "Set branch protection rules for a branch. This replaces the entire existing ruleset for that branch — requires confirm: true.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        branch: z.string().describe("Branch name to protect"),
        required_approving_review_count: z.number().int().min(0).max(6).optional().describe("Required approving reviews (default 1)"),
        require_code_owner_reviews: z.boolean().optional().describe("Require code owner review (default false)"),
        required_status_check_contexts: z.array(z.string()).optional().describe("Required CI check names"),
        enforce_admins: z.boolean().optional().describe("Also enforce rules on admins (default true)"),
        allow_force_pushes: z.boolean().optional().describe("Allow force pushes (default false)"),
        confirm: z.literal(true).describe("Must be exactly true — this replaces the entire existing ruleset"),
      },
    },
    async ({
      owner,
      repo,
      branch,
      required_approving_review_count,
      require_code_owner_reviews,
      required_status_check_contexts,
      enforce_admins,
      allow_force_pushes,
      confirm,
    }) => {
      try {
        return ok(
          await setBranchProtection(owner, repo, branch, confirm, {
            required_approving_review_count,
            require_code_owner_reviews,
            required_status_check_contexts,
            enforce_admins,
            allow_force_pushes,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "update_repository_settings",
    {
      description:
        "Update repository settings (visibility, default branch, description, feature toggles, merge options). Changing 'private' requires confirm: true.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        private: z.boolean().optional().describe("Change repository visibility (requires confirm: true)"),
        default_branch: z.string().optional().describe("Change the default branch"),
        description: z.string().optional().describe("Update the description"),
        has_issues: z.boolean().optional().describe("Enable/disable Issues"),
        has_projects: z.boolean().optional().describe("Enable/disable Projects"),
        has_wiki: z.boolean().optional().describe("Enable/disable Wiki"),
        allow_squash_merge: z.boolean().optional(),
        allow_merge_commit: z.boolean().optional(),
        allow_rebase_merge: z.boolean().optional(),
        delete_branch_on_merge: z.boolean().optional(),
        confirm: z.boolean().optional().describe("Required (true) when 'private' is set"),
      },
    },
    async ({ owner, repo, confirm, ...opts }) => {
      try {
        return ok(await updateRepositorySettings(owner, repo, opts, confirm ?? false));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_rate_limit",
    {
      description: "Get the current GitHub API rate limit status for a token.",
      inputSchema: {
        account: z.string().optional().describe("Which account's token to check (defaults to the default GITHUB_TOKEN)"),
      },
    },
    async ({ account }) => {
      try {
        return ok(await getRateLimit(account));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
