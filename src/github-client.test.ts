import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { githubToken, toActionableError } from "./github-client.js";

describe("githubToken", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN_MY_WORK_ORG;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("throws when no token is set", () => {
    assert.throws(() => githubToken(), /GITHUB_TOKEN environment variable is not set/);
  });

  test("throws an owner-specific message when owner given and nothing set", () => {
    assert.throws(() => githubToken("my-work-org"), /GITHUB_TOKEN_MY_WORK_ORG/);
  });

  test("falls back to default GITHUB_TOKEN when no owner-specific token exists", () => {
    process.env.GITHUB_TOKEN = "default-token";
    assert.equal(githubToken("some-owner"), "default-token");
  });

  test("prefers the owner-specific token over the default", () => {
    process.env.GITHUB_TOKEN = "default-token";
    process.env.GITHUB_TOKEN_MY_WORK_ORG = "work-token";
    assert.equal(githubToken("my-work-org"), "work-token");
  });
});

describe("toActionableError", () => {
  test("401 -> authentication message", () => {
    const err = toActionableError({ status: 401 }, "creating issue");
    assert.match(err.message, /authentication failed/);
  });

  test("403 with rate limit header -> rate limit message", () => {
    const err = toActionableError(
      { status: 403, response: { headers: { "x-ratelimit-remaining": "0" } } },
      "listing issues",
    );
    assert.match(err.message, /rate limit exceeded/);
  });

  test("403 without rate limit header -> permission message", () => {
    const err = toActionableError({ status: 403, response: { headers: {} } }, "merging pull request");
    assert.match(err.message, /lacks permission/);
  });

  test("404 -> not found message", () => {
    const err = toActionableError({ status: 404 }, "fetching repo");
    assert.match(err.message, /Not found/);
  });

  test("422 -> validation message with field errors joined", () => {
    const err = toActionableError(
      { status: 422, response: { data: { errors: [{ message: "already exists" }] } } },
      "creating repository",
    );
    assert.match(err.message, /Validation failed/);
    assert.match(err.message, /already exists/);
  });

  test("unknown error -> generic fallback with message", () => {
    const err = toActionableError(new Error("boom"), "doing something");
    assert.match(err.message, /Failed while doing something: boom/);
  });
});
