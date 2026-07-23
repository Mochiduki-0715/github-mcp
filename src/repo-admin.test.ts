import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRepository, listBranches, setBranchProtection, updateRepositorySettings, getRateLimit, type RepoAdminOctokit } from "./repo-admin.js";

function fakeRepo(overrides: Partial<any> = {}) {
  return {
    name: "r",
    full_name: "o/r",
    html_url: "https://github.com/o/r",
    private: true,
    default_branch: "main",
    ...overrides,
  };
}

describe("createRepository", () => {
  test("uses createInOrg when org is given", async () => {
    let usedOrg = false;
    const client: RepoAdminOctokit = {
      rest: {
        repos: {
          createInOrg: (async () => {
            usedOrg = true;
            return { data: fakeRepo() };
          }) as any,
          createForAuthenticatedUser: (async () => {
            throw new Error("should not be called");
          }) as any,
        } as any,
        rateLimit: {} as any,
      },
    };
    await createRepository("r", { org: "my-org" }, client);
    assert.equal(usedOrg, true);
  });

  test("uses createForAuthenticatedUser when no org given", async () => {
    let usedPersonal = false;
    const client: RepoAdminOctokit = {
      rest: {
        repos: {
          createForAuthenticatedUser: (async () => {
            usedPersonal = true;
            return { data: fakeRepo() };
          }) as any,
        } as any,
        rateLimit: {} as any,
      },
    };
    await createRepository("r", {}, client);
    assert.equal(usedPersonal, true);
  });
});

describe("listBranches", () => {
  test("maps branch protection flags", async () => {
    const client: RepoAdminOctokit = {
      rest: {
        repos: { listBranches: (async () => ({ data: [{ name: "main", protected: true }] })) as any } as any,
        rateLimit: {} as any,
      },
    };
    const branches = await listBranches("o", "r", client);
    assert.deepEqual(branches, [{ name: "main", protected: true }]);
  });
});

describe("setBranchProtection", () => {
  test("throws without confirm: true", async () => {
    const client: RepoAdminOctokit = { rest: { repos: {} as any, rateLimit: {} as any } };
    await assert.rejects(() => setBranchProtection("o", "r", "main", false, {}, client), /requires confirm: true/);
  });

  test("applies protection when confirmed", async () => {
    const client: RepoAdminOctokit = {
      rest: {
        repos: { updateBranchProtection: (async () => ({ data: { url: "u" } })) as any } as any,
        rateLimit: {} as any,
      },
    };
    const result = await setBranchProtection("o", "r", "main", true, {}, client);
    assert.equal(result.url, "u");
  });
});

describe("updateRepositorySettings", () => {
  test("throws when changing private without confirm", async () => {
    const client: RepoAdminOctokit = { rest: { repos: {} as any, rateLimit: {} as any } };
    await assert.rejects(() => updateRepositorySettings("o", "r", { private: false }, false, client), /requires confirm: true/);
  });

  test("allows non-visibility changes without confirm", async () => {
    const client: RepoAdminOctokit = {
      rest: { repos: { update: (async () => ({ data: fakeRepo({ description: "new" }) })) as any } as any, rateLimit: {} as any },
    };
    const repo = await updateRepositorySettings("o", "r", { description: "new" }, false, client);
    assert.equal(repo.name, "r");
  });

  test("allows changing private when confirmed", async () => {
    const client: RepoAdminOctokit = {
      rest: { repos: { update: (async () => ({ data: fakeRepo({ private: false }) })) as any } as any, rateLimit: {} as any },
    };
    const repo = await updateRepositorySettings("o", "r", { private: false }, true, client);
    assert.equal(repo.private, false);
  });
});

describe("getRateLimit", () => {
  test("formats reset time as ISO string", async () => {
    const client: RepoAdminOctokit = {
      rest: {
        repos: {} as any,
        rateLimit: { get: (async () => ({ data: { resources: { core: { limit: 5000, remaining: 4999, reset: 1750000000 } } } })) as any },
      },
    };
    const result = await getRateLimit(undefined, client);
    assert.equal(result.limit, 5000);
    assert.equal(result.remaining, 4999);
    assert.equal(result.reset, new Date(1750000000 * 1000).toISOString());
  });
});
