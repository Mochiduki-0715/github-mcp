import type { Octokit } from "@octokit/rest";
import { githubClient, toActionableError } from "./github-client.js";

export interface RepoAdminOctokit {
  rest: {
    repos: Pick<
      Octokit["rest"]["repos"],
      "createInOrg" | "createForAuthenticatedUser" | "listBranches" | "updateBranchProtection" | "update"
    >;
    rateLimit: Pick<Octokit["rest"]["rateLimit"], "get">;
  };
}

export interface RepositorySummary {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  default_branch: string;
}

function toSummary(repo: any): RepositorySummary {
  return {
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    private: repo.private,
    default_branch: repo.default_branch,
  };
}

export async function createRepository(
  name: string,
  opts: {
    org?: string;
    account?: string;
    private?: boolean;
    description?: string;
    auto_init?: boolean;
    gitignore_template?: string;
    license_template?: string;
  } = {},
  client: RepoAdminOctokit = githubClient(opts.account ?? opts.org),
): Promise<RepositorySummary> {
  const params = {
    name,
    private: opts.private ?? true,
    description: opts.description,
    auto_init: opts.auto_init ?? true,
    gitignore_template: opts.gitignore_template,
    license_template: opts.license_template,
  };
  try {
    const { data } = opts.org
      ? await client.rest.repos.createInOrg({ org: opts.org, ...params })
      : await client.rest.repos.createForAuthenticatedUser(params);
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, `creating repository "${name}"`);
  }
}

export async function listBranches(
  owner: string,
  repo: string,
  client: RepoAdminOctokit = githubClient(owner),
): Promise<Array<{ name: string; protected: boolean }>> {
  try {
    const { data } = await client.rest.repos.listBranches({ owner, repo });
    return data.map((b: any) => ({ name: b.name, protected: Boolean(b.protected) }));
  } catch (err) {
    throw toActionableError(err, "listing branches");
  }
}

export async function setBranchProtection(
  owner: string,
  repo: string,
  branch: string,
  confirm: boolean,
  opts: {
    required_approving_review_count?: number;
    require_code_owner_reviews?: boolean;
    required_status_check_contexts?: string[];
    enforce_admins?: boolean;
    allow_force_pushes?: boolean;
  } = {},
  client: RepoAdminOctokit = githubClient(owner),
): Promise<{ url: string }> {
  if (confirm !== true) {
    throw new Error(
      "set_branch_protection requires confirm: true — this replaces the entire existing protection ruleset for the branch.",
    );
  }
  try {
    const { data } = await client.rest.repos.updateBranchProtection({
      owner,
      repo,
      branch,
      required_status_checks: opts.required_status_check_contexts
        ? { strict: true, contexts: opts.required_status_check_contexts }
        : null,
      enforce_admins: opts.enforce_admins ?? true,
      required_pull_request_reviews: {
        required_approving_review_count: opts.required_approving_review_count ?? 1,
        require_code_owner_reviews: opts.require_code_owner_reviews ?? false,
      },
      restrictions: null,
      allow_force_pushes: opts.allow_force_pushes ?? false,
    });
    return { url: data.url };
  } catch (err) {
    throw toActionableError(err, `setting branch protection on "${branch}"`);
  }
}

export async function updateRepositorySettings(
  owner: string,
  repo: string,
  opts: {
    private?: boolean;
    default_branch?: string;
    description?: string;
    has_issues?: boolean;
    has_projects?: boolean;
    has_wiki?: boolean;
    allow_squash_merge?: boolean;
    allow_merge_commit?: boolean;
    allow_rebase_merge?: boolean;
    delete_branch_on_merge?: boolean;
  },
  confirm = false,
  client: RepoAdminOctokit = githubClient(owner),
): Promise<RepositorySummary> {
  if (opts.private !== undefined && confirm !== true) {
    throw new Error("update_repository_settings requires confirm: true when changing 'private' — this changes who can see the repository.");
  }
  try {
    const { data } = await client.rest.repos.update({ owner, repo, ...opts });
    return toSummary(data);
  } catch (err) {
    throw toActionableError(err, "updating repository settings");
  }
}

export async function getRateLimit(
  account?: string,
  client: RepoAdminOctokit = githubClient(account),
): Promise<{ limit: number; remaining: number; reset: string }> {
  try {
    const { data } = await client.rest.rateLimit.get();
    const core = data.resources.core;
    return { limit: core.limit, remaining: core.remaining, reset: new Date(core.reset * 1000).toISOString() };
  } catch (err) {
    throw toActionableError(err, "fetching rate limit");
  }
}
