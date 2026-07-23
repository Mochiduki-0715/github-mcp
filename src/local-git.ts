import * as fs from "node:fs";
import * as path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { githubToken } from "./github-client.js";

async function currentBranch(git: SimpleGit): Promise<string> {
  try {
    return (await git.raw(["symbolic-ref", "--short", "HEAD"])).trim();
  } catch {
    throw new Error("Cannot determine the current branch (detached HEAD?). Checkout a branch first.");
  }
}

function protectedBranches(): string[] {
  const raw = process.env.GITHUB_MCP_PROTECTED_BRANCHES;
  const list = raw
    ? raw
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean)
    : ["main", "master", "develop", "dev"];
  return list.map((b) => b.toLowerCase());
}

export function assertNotProtectedBranch(branch: string): void {
  if (protectedBranches().includes(branch.toLowerCase())) {
    throw new Error(
      `Refusing to commit/push to protected branch "${branch}". Create a feature branch first (use create_branch).`,
    );
  }
}

function assertGitRepo(repoPath: string): string {
  const abs = path.resolve(repoPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }
  if (!fs.existsSync(path.join(abs, ".git"))) {
    throw new Error(`Not a git repository (no .git found): ${abs}`);
  }
  return abs;
}

export function parseOwnerFromRemoteUrl(url: string): string | undefined {
  const match = url.trim().match(/github\.com[/:]([^/]+)\/[^/]+?(?:\.git)?\/?$/);
  return match ? match[1] : undefined;
}

export async function gitStatus(repoPath: string) {
  const abs = assertGitRepo(repoPath);
  const git = simpleGit(abs);
  const status = await git.status();
  return {
    current: status.current,
    staged: status.staged,
    modified: status.modified,
    not_added: status.not_added,
    deleted: status.deleted,
    conflicted: status.conflicted,
    ahead: status.ahead,
    behind: status.behind,
  };
}

const MAX_DIFF_LENGTH = 20000;

export async function gitDiff(repoPath: string, staged = false, files: string[] = []) {
  const abs = assertGitRepo(repoPath);
  const git = simpleGit(abs);
  const args = [...(staged ? ["--cached"] : []), ...files];
  const diff = await git.diff(args);
  if (diff.length > MAX_DIFF_LENGTH) {
    return { diff: diff.slice(0, MAX_DIFF_LENGTH), truncated: true };
  }
  return { diff, truncated: false };
}

export async function createBranch(repoPath: string, branchName: string, from?: string): Promise<{ branch: string }> {
  const abs = assertGitRepo(repoPath);
  const git = simpleGit(abs);
  try {
    if (from) {
      await git.checkout(from);
    }
    await git.checkoutLocalBranch(branchName);
    return { branch: branchName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to create branch "${branchName}": ${message}`);
  }
}

export async function commitChanges(
  repoPath: string,
  message: string,
  files?: string[],
  stageAll = false,
): Promise<{ commit: string; branch: string; summary: { changes: number; insertions: number; deletions: number } }> {
  const abs = assertGitRepo(repoPath);
  const git = simpleGit(abs);
  const current = await currentBranch(git);
  assertNotProtectedBranch(current);

  if (files && files.length > 0) {
    await git.add(files);
  } else if (stageAll) {
    await git.add(["-A"]);
  } else {
    throw new Error("commit_changes requires either 'files' or 'stage_all: true'.");
  }

  const statusAfterAdd = await git.status();
  if (statusAfterAdd.staged.length === 0) {
    throw new Error("No staged changes to commit. Pass stage_all: true or specify files that actually changed.");
  }

  const result = await git.commit(message);
  return {
    commit: result.commit,
    branch: current,
    summary: {
      changes: result.summary.changes,
      insertions: result.summary.insertions,
      deletions: result.summary.deletions,
    },
  };
}

export async function pushBranch(
  repoPath: string,
  remote = "origin",
  branch?: string,
): Promise<{ pushed: boolean; remote: string; branch: string }> {
  const abs = assertGitRepo(repoPath);
  const git = simpleGit(abs);
  const targetBranch = branch ?? (await currentBranch(git));
  assertNotProtectedBranch(targetBranch);

  const remoteUrlRaw = await git.remote(["get-url", remote]);
  const remoteUrl = typeof remoteUrlRaw === "string" ? remoteUrlRaw.trim() : "";
  if (!remoteUrl) {
    throw new Error(`Remote "${remote}" not found.`);
  }

  try {
    if (remoteUrl.startsWith("https://") || remoteUrl.startsWith("http://")) {
      const owner = parseOwnerFromRemoteUrl(remoteUrl);
      const token = githubToken(owner);
      const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
      await git.raw(["-c", `http.extraheader=${header}`, "push", remote, targetBranch]);
    } else {
      await git.push(remote, targetBranch);
    }
    return { pushed: true, remote, branch: targetBranch };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/non-fast-forward|fetch first|rejected/i.test(message)) {
      throw new Error(`Push rejected (non-fast-forward) — github-mcp does not force-push. Pull/rebase locally first. (${message})`);
    }
    if (/authentication|403|could not read/i.test(message)) {
      throw new Error(`Push failed: GitHub authentication failed — check GITHUB_TOKEN has 'repo' scope for this repository. (${message})`);
    }
    throw new Error(`Push failed: ${message}`);
  }
}
