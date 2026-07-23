import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import type { Octokit } from "@octokit/rest";
import { githubClient, toActionableError } from "./github-client.js";

export interface SyncOctokit {
  rest: {
    issues: Pick<Octokit["rest"]["issues"], "listForRepo" | "create">;
    pulls: Pick<Octokit["rest"]["pulls"], "list">;
  };
}

const MY_NOTES_HEADING = "## My Notes";

function vaultRoot(): string {
  const root = process.env.OBSIDIAN_VAULT_PATH;
  if (!root) {
    throw new Error("OBSIDIAN_VAULT_PATH environment variable is not set. Required for sync_* tools.");
  }
  return path.resolve(root);
}

function resolveVaultPath(root: string, relativePath: string): string {
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes the vault: ${relativePath}`);
  }
  return abs;
}

function splitMyNotes(body: string): string | null {
  const idx = body.indexOf(MY_NOTES_HEADING);
  return idx === -1 ? null : body.slice(idx);
}

function writeNoteFile(absPath: string, data: Record<string, unknown>, content: string): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, matter.stringify(content, data), "utf8");
}

export type SyncAction = "created" | "updated" | "skipped";

export interface SyncResultItem {
  owner: string;
  repo: string;
  number: number;
  type: "issue" | "pull_request";
  action: SyncAction;
}

function writeGithubNote(root: string, owner: string, repo: string, source: "issue" | "pull_request", item: any): SyncAction {
  const folder = source === "issue" ? "Issues" : "PRs";
  const relPath = path.join("GitHub", owner, repo, folder, `${item.number}.md`);
  const absPath = resolveVaultPath(root, relPath);

  let existing: { data: Record<string, any>; content: string } | null = null;
  if (fs.existsSync(absPath)) {
    existing = matter(fs.readFileSync(absPath, "utf8"));
    if (existing.data.github_updated_at === item.updated_at) {
      return "skipped";
    }
  }

  const preserved = existing ? splitMyNotes(existing.content) : null;
  const body = `# ${item.title}\n\n${item.body ?? ""}\n\n${preserved ?? `${MY_NOTES_HEADING}\n\n`}`;

  const frontmatter = {
    github_source: source,
    github_owner: owner,
    github_repo: repo,
    github_number: item.number,
    github_url: item.html_url,
    github_state: item.state,
    github_updated_at: item.updated_at,
  };

  writeNoteFile(absPath, frontmatter, body);
  return existing ? "updated" : "created";
}

export async function syncGithubToVault(
  repos: Array<{ owner: string; repo: string }>,
  opts: { state?: "open" | "closed" | "all"; include_prs?: boolean } = {},
  clientFactory: (owner: string) => SyncOctokit = (owner) => githubClient(owner) as unknown as SyncOctokit,
): Promise<SyncResultItem[]> {
  if (repos.length === 0) {
    throw new Error("sync_github_to_vault requires at least one entry in 'repos'.");
  }
  const root = vaultRoot();
  const results: SyncResultItem[] = [];
  for (const { owner, repo } of repos) {
    const client = clientFactory(owner);
    try {
      const { data: issues } = await client.rest.issues.listForRepo({ owner, repo, state: opts.state ?? "open" });
      for (const issue of issues as any[]) {
        if (issue.pull_request) continue;
        const action = writeGithubNote(root, owner, repo, "issue", issue);
        results.push({ owner, repo, number: issue.number, type: "issue", action });
      }
      if (opts.include_prs) {
        const { data: prs } = await client.rest.pulls.list({ owner, repo, state: opts.state ?? "open" });
        for (const pr of prs as any[]) {
          const action = writeGithubNote(root, owner, repo, "pull_request", pr);
          results.push({ owner, repo, number: pr.number, type: "pull_request", action });
        }
      }
    } catch (err) {
      throw toActionableError(err, `syncing ${owner}/${repo} to vault`);
    }
  }
  return results;
}

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

export interface CreatedIssueFromNote {
  path: string;
  owner: string;
  repo: string;
  number: number;
  url: string;
}

export async function syncVaultToGithub(
  folder?: string,
  clientFactory: (owner: string) => SyncOctokit = (owner) => githubClient(owner) as unknown as SyncOctokit,
): Promise<CreatedIssueFromNote[]> {
  const root = vaultRoot();
  const scanDir = folder ? resolveVaultPath(root, folder) : root;
  if (!fs.existsSync(scanDir)) {
    throw new Error(`Folder not found in vault: ${folder}`);
  }

  const results: CreatedIssueFromNote[] = [];
  for (const absPath of listMarkdownFiles(scanDir)) {
    const parsed = matter(fs.readFileSync(absPath, "utf8"));
    if (parsed.data.github_sync !== "create_issue" || parsed.data.github_number) continue;

    const owner = parsed.data.github_owner;
    const repoName = parsed.data.github_repo;
    const relNotePath = path.relative(root, absPath);
    if (!owner || !repoName) {
      throw new Error(`Note "${relNotePath}" has github_sync: create_issue but is missing github_owner/github_repo.`);
    }

    const title = parsed.data.title ?? path.basename(absPath, ".md");
    const client = clientFactory(owner);
    try {
      const { data: issue } = await client.rest.issues.create({
        owner,
        repo: repoName,
        title,
        body: parsed.content.trim() || undefined,
        labels: parsed.data.github_labels,
        assignees: parsed.data.github_assignees,
      });
      const newData = {
        ...parsed.data,
        github_source: "issue",
        github_number: issue.number,
        github_url: issue.html_url,
        github_state: issue.state,
        github_updated_at: issue.updated_at,
      };
      fs.writeFileSync(absPath, matter.stringify(parsed.content, newData), "utf8");
      results.push({ path: relNotePath, owner, repo: repoName, number: issue.number, url: issue.html_url });
    } catch (err) {
      throw toActionableError(err, `creating issue from note "${relNotePath}"`);
    }
  }
  return results;
}
