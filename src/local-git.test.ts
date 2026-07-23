import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { gitStatus, gitDiff, createBranch, commitChanges, pushBranch, parseOwnerFromRemoteUrl } from "./local-git.js";

let repoDir: string;
const originalEnv = { ...process.env };

async function initRepo(dir: string, initialBranch = "main") {
  const git = simpleGit(dir);
  await git.init(["--initial-branch", initialBranch]);
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@example.com");
  return git;
}

beforeEach(async () => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-mcp-test-"));
  delete process.env.GITHUB_MCP_PROTECTED_BRANCHES;
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe("parseOwnerFromRemoteUrl", () => {
  test("parses https urls", () => {
    assert.equal(parseOwnerFromRemoteUrl("https://github.com/my-org/my-repo.git"), "my-org");
    assert.equal(parseOwnerFromRemoteUrl("https://github.com/my-org/my-repo"), "my-org");
  });

  test("parses ssh urls", () => {
    assert.equal(parseOwnerFromRemoteUrl("git@github.com:my-org/my-repo.git"), "my-org");
  });

  test("returns undefined for unrecognized urls", () => {
    assert.equal(parseOwnerFromRemoteUrl("https://example.com/x/y"), undefined);
  });
});

describe("gitStatus / gitDiff", () => {
  test("reports untracked and modified files", async () => {
    await initRepo(repoDir);
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    const status = await gitStatus(repoDir);
    assert.deepEqual(status.not_added, ["a.txt"]);
  });

  test("diff reflects staged changes", async () => {
    const git = await initRepo(repoDir);
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello\n");
    await git.add(["a.txt"]);
    const { diff } = await gitDiff(repoDir, true);
    assert.match(diff, /hello/);
  });

  test("throws for a non-git directory", async () => {
    await assert.rejects(() => gitStatus(repoDir), /Not a git repository/);
  });
});

describe("createBranch", () => {
  test("creates and switches to a new branch", async () => {
    const git = await initRepo(repoDir);
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await createBranch(repoDir, "feature/x");
    const current = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
    assert.equal(current, "feature/x");
  });

  test("fails when the branch already exists", async () => {
    const git = await initRepo(repoDir);
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await createBranch(repoDir, "feature/x");
    await git.checkout("main");
    await assert.rejects(() => createBranch(repoDir, "feature/x"), /Failed to create branch/);
  });
});

describe("commitChanges", () => {
  test("refuses to commit on a protected branch (main)", async () => {
    await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await assert.rejects(() => commitChanges(repoDir, "msg", ["a.txt"]), /protected branch "main"/);
  });

  test("refuses to commit on develop too", async () => {
    await initRepo(repoDir, "develop");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await assert.rejects(() => commitChanges(repoDir, "msg", ["a.txt"]), /protected branch "develop"/);
  });

  test("succeeds on a feature branch", async () => {
    const git = await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await createBranch(repoDir, "feature/x");
    fs.writeFileSync(path.join(repoDir, "b.txt"), "world");
    const result = await commitChanges(repoDir, "add b", ["b.txt"]);
    assert.equal(result.branch, "feature/x");
  });

  test("commit message is used verbatim (no AI trailers)", async () => {
    const git = await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await createBranch(repoDir, "feature/x");
    fs.writeFileSync(path.join(repoDir, "b.txt"), "world");
    await commitChanges(repoDir, "plain message, nothing added", ["b.txt"]);
    const log = await git.log();
    assert.equal(log.latest?.message, "plain message, nothing added");
    assert.equal(log.latest?.author_name, "Test User");
  });

  test("throws when nothing is staged", async () => {
    const git = await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await createBranch(repoDir, "feature/x");
    await assert.rejects(() => commitChanges(repoDir, "msg", undefined, false), /requires either 'files' or 'stage_all: true'/);
  });

  test("respects GITHUB_MCP_PROTECTED_BRANCHES override", async () => {
    process.env.GITHUB_MCP_PROTECTED_BRANCHES = "trunk";
    const git = await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    const result = await commitChanges(repoDir, "init on main since only trunk is protected", ["a.txt"]);
    assert.equal(result.branch, "main");
    await createBranch(repoDir, "trunk");
    fs.writeFileSync(path.join(repoDir, "b.txt"), "x");
    await assert.rejects(() => commitChanges(repoDir, "msg", ["b.txt"]), /protected branch "trunk"/);
  });
});

describe("pushBranch", () => {
  test("pushes to a local bare remote over the non-HTTPS path", async () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), "github-mcp-bare-"));
    try {
      await simpleGit(bareDir).init(["--bare", "--initial-branch", "main"]);

      const git = await initRepo(repoDir, "main");
      fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
      await git.add(["a.txt"]);
      await git.commit("init");
      await createBranch(repoDir, "feature/x");
      fs.writeFileSync(path.join(repoDir, "b.txt"), "world");
      await commitChanges(repoDir, "feature commit", ["b.txt"]);

      await git.addRemote("origin", bareDir);
      const result = await pushBranch(repoDir, "origin", "feature/x");
      assert.equal(result.pushed, true);

      const bareGit = simpleGit(bareDir);
      const branches = await bareGit.branch();
      assert.ok(branches.all.includes("feature/x"));
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  test("refuses to push a protected branch", async () => {
    const git = await initRepo(repoDir, "main");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "hello");
    await git.add(["a.txt"]);
    await git.commit("init");
    await assert.rejects(() => pushBranch(repoDir, "origin", "main"), /protected branch "main"/);
  });
});
