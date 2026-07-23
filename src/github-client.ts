import { Octokit } from "@octokit/rest";

function envKeyFor(owner: string): string {
  return `GITHUB_TOKEN_${owner.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export function githubToken(owner?: string): string {
  const specific = owner ? process.env[envKeyFor(owner)] : undefined;
  const token = specific ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      owner
        ? `No GitHub token found for owner "${owner}". Set ${envKeyFor(owner)} or the default GITHUB_TOKEN.`
        : "GITHUB_TOKEN environment variable is not set. Create a classic PAT with 'repo' scope " +
          "(add 'delete_repo'/'admin:org' if needed) and export it as GITHUB_TOKEN.",
    );
  }
  return token;
}

export function githubClient(owner?: string): Octokit {
  return new Octokit({ auth: githubToken(owner), userAgent: "github-mcp" });
}

export function toActionableError(err: unknown, context: string): Error {
  const e = err as { status?: number; message?: string; response?: { headers?: Record<string, string>; data?: { errors?: Array<{ message?: string }> } } };
  if (e?.status === 401) {
    return new Error(`GitHub authentication failed while ${context} — check that GITHUB_TOKEN is valid and unexpired.`);
  }
  if (e?.status === 403) {
    if (e?.response?.headers?.["x-ratelimit-remaining"] === "0") {
      return new Error(`GitHub API rate limit exceeded while ${context}. Try again later.`);
    }
    return new Error(`GITHUB_TOKEN lacks permission to ${context} (needs 'repo' scope, or org access).`);
  }
  if (e?.status === 404) {
    return new Error(`Not found while ${context} — check the owner/repo/number, or that GITHUB_TOKEN has access.`);
  }
  if (e?.status === 422) {
    const details = e?.response?.data?.errors?.map((x) => x.message ?? JSON.stringify(x)).join("; ");
    return new Error(`Validation failed while ${context}${details ? `: ${details}` : ""}.`);
  }
  return new Error(`Failed while ${context}: ${e?.message ?? String(err)}`);
}
