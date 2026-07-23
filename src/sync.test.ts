import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import matter from "gray-matter";
import { syncGithubToVault, syncVaultToGithub, type SyncOctokit } from "./sync.js";

let vaultDir: string;
const originalEnv = { ...process.env };

beforeEach(() => {
  vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-mcp-vault-"));
  process.env.OBSIDIAN_VAULT_PATH = vaultDir;
});

afterEach(() => {
  fs.rmSync(vaultDir, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

function fakeIssue(overrides: Partial<any> = {}) {
  return {
    number: 1,
    title: "Test issue",
    body: "issue body",
    html_url: "https://github.com/o/r/issues/1",
    state: "open",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeClientFactory(issues: any[], prs: any[] = []) {
  const client: SyncOctokit = {
    rest: {
      issues: { listForRepo: (async () => ({ data: issues })) as any } as any,
      pulls: { list: (async () => ({ data: prs })) as any } as any,
    },
  };
  return () => client;
}

describe("syncGithubToVault", () => {
  test("creates a note per issue under GitHub/<owner>/<repo>/Issues", async () => {
    const factory = makeClientFactory([fakeIssue()]);
    const results = await syncGithubToVault([{ owner: "o", repo: "r" }], {}, factory);
    assert.equal(results[0].action, "created");
    const notePath = path.join(vaultDir, "GitHub", "o", "r", "Issues", "1.md");
    assert.ok(fs.existsSync(notePath));
    const parsed = matter(fs.readFileSync(notePath, "utf8"));
    assert.equal(parsed.data.github_number, 1);
    assert.equal(parsed.data.github_owner, "o");
    assert.match(parsed.content, /# Test issue/);
  });

  test("skips when github_updated_at is unchanged", async () => {
    const factory = makeClientFactory([fakeIssue()]);
    await syncGithubToVault([{ owner: "o", repo: "r" }], {}, factory);
    const results = await syncGithubToVault([{ owner: "o", repo: "r" }], {}, factory);
    assert.equal(results[0].action, "skipped");
  });

  test("updates when github_updated_at changes, and preserves ## My Notes", async () => {
    const factory1 = makeClientFactory([fakeIssue()]);
    await syncGithubToVault([{ owner: "o", repo: "r" }], {}, factory1);

    const notePath = path.join(vaultDir, "GitHub", "o", "r", "Issues", "1.md");
    const parsed = matter(fs.readFileSync(notePath, "utf8"));
    fs.writeFileSync(notePath, matter.stringify(`${parsed.content}\nMy personal thoughts here.`, parsed.data));

    const factory2 = makeClientFactory([fakeIssue({ title: "Updated title", updated_at: "2026-01-02T00:00:00Z" })]);
    const results = await syncGithubToVault([{ owner: "o", repo: "r" }], {}, factory2);
    assert.equal(results[0].action, "updated");

    const updated = matter(fs.readFileSync(notePath, "utf8"));
    assert.match(updated.content, /# Updated title/);
    assert.match(updated.content, /My personal thoughts here\./);
  });

  test("routes multiple repos to their own folders", async () => {
    const factory: () => SyncOctokit = () => ({
      rest: {
        issues: { listForRepo: (async (params: any) => ({ data: [fakeIssue({ number: params.repo === "r1" ? 1 : 2 })] })) as any } as any,
        pulls: { list: (async () => ({ data: [] })) as any } as any,
      },
    });
    await syncGithubToVault(
      [
        { owner: "o1", repo: "r1" },
        { owner: "o2", repo: "r2" },
      ],
      {},
      factory,
    );
    assert.ok(fs.existsSync(path.join(vaultDir, "GitHub", "o1", "r1", "Issues", "1.md")));
    assert.ok(fs.existsSync(path.join(vaultDir, "GitHub", "o2", "r2", "Issues", "2.md")));
  });

  test("excludes entries with a pull_request field from the issues list, includes PRs only when include_prs is set", async () => {
    const factory = makeClientFactory(
      [fakeIssue({ number: 1 }), fakeIssue({ number: 2, pull_request: { url: "x" } })],
      [fakeIssue({ number: 2, title: "A PR" })],
    );
    const results = await syncGithubToVault([{ owner: "o", repo: "r" }], { include_prs: true }, factory);
    assert.equal(results.filter((r) => r.type === "issue").length, 1);
    assert.equal(results.filter((r) => r.type === "pull_request").length, 1);
    assert.ok(fs.existsSync(path.join(vaultDir, "GitHub", "o", "r", "PRs", "2.md")));
  });

  test("throws when repos is empty", async () => {
    await assert.rejects(() => syncGithubToVault([], {}, makeClientFactory([])), /requires at least one entry/);
  });
});

describe("syncVaultToGithub", () => {
  test("creates an issue from a flagged note and writes back tracking frontmatter", async () => {
    const notePath = path.join(vaultDir, "todo.md");
    fs.writeFileSync(
      notePath,
      matter.stringify("Body content for the issue.", {
        title: "My new issue",
        github_sync: "create_issue",
        github_owner: "o",
        github_repo: "r",
      }),
    );

    const factory: () => SyncOctokit = () => ({
      rest: {
        issues: {
          create: (async () => ({
            data: { number: 42, html_url: "https://github.com/o/r/issues/42", state: "open", updated_at: "2026-01-01T00:00:00Z" },
          })) as any,
        } as any,
        pulls: {} as any,
      },
    });

    const results = await syncVaultToGithub(undefined, factory);
    assert.equal(results.length, 1);
    assert.equal(results[0].number, 42);

    const updated = matter(fs.readFileSync(notePath, "utf8"));
    assert.equal(updated.data.github_number, 42);
    assert.equal(updated.data.github_source, "issue");
  });

  test("does not recreate an issue for a note that already has github_number", async () => {
    const notePath = path.join(vaultDir, "already-done.md");
    fs.writeFileSync(
      notePath,
      matter.stringify("Body.", {
        github_sync: "create_issue",
        github_owner: "o",
        github_repo: "r",
        github_number: 7,
      }),
    );

    let created = false;
    const factory: () => SyncOctokit = () => ({
      rest: {
        issues: {
          create: (async () => {
            created = true;
            return { data: { number: 999, html_url: "u", state: "open", updated_at: "x" } };
          }) as any,
        } as any,
        pulls: {} as any,
      },
    });

    const results = await syncVaultToGithub(undefined, factory);
    assert.equal(results.length, 0);
    assert.equal(created, false);
  });

  test("ignores notes without the github_sync flag", async () => {
    fs.writeFileSync(path.join(vaultDir, "unrelated.md"), "# Just a note\n\nNothing to sync.");
    const factory: () => SyncOctokit = () => ({
      rest: { issues: { create: (async () => ({ data: {} })) as any } as any, pulls: {} as any },
    });
    const results = await syncVaultToGithub(undefined, factory);
    assert.equal(results.length, 0);
  });
});
