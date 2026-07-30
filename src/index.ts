#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { githubToken } from "./github-client.js";
import { registerIssueTools } from "./tools/issue-tools.js";
import { registerPullRequestTools } from "./tools/pr-tools.js";
import { registerRepoAdminTools } from "./tools/repo-admin-tools.js";
import { registerActionsTools } from "./tools/actions-tools.js";
import { registerLocalGitTools } from "./tools/local-git-tools.js";
import { registerSyncTools } from "./tools/sync-tools.js";

const server = new McpServer({ name: "github-mcp", version: "0.1.0" });

registerIssueTools(server);
registerPullRequestTools(server);
registerRepoAdminTools(server);
registerActionsTools(server);
registerLocalGitTools(server);
registerSyncTools(server);

async function main() {
  try {
    githubToken();
  } catch (err) {
    console.error(`github-mcp: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  await server.connect(new StdioServerTransport());
  console.error("github-mcp: server started");
}

main().catch((err) => {
  console.error("github-mcp: fatal:", err);
  process.exit(1);
});
