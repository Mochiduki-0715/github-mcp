import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listWorkflows, listWorkflowRuns, getWorkflowRun, triggerWorkflow, cancelWorkflowRun } from "../actions.js";
import { ok, fail } from "../tool-helpers.js";

export function registerActionsTools(server: McpServer): void {
  server.registerTool(
    "list_workflows",
    {
      description: "List workflows defined in a repository.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ owner, repo }) => {
      try {
        return ok(await listWorkflows(owner, repo));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_workflow_runs",
    {
      description: "List GitHub Actions workflow runs for a repository, optionally filtered by workflow, branch, or status.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        workflow_id: z
          .union([z.string(), z.number()])
          .optional()
          .describe("Workflow ID or filename, e.g. 'test.yml' (omit to list runs across all workflows)"),
        branch: z.string().optional().describe("Filter by branch name"),
        status: z.string().optional().describe("Filter by status/conclusion, e.g. 'completed', 'in_progress', 'failure'"),
        per_page: z.number().int().min(1).max(100).optional().describe("Results per page (default 30, max 100)"),
      },
    },
    async ({ owner, repo, workflow_id, branch, status, per_page }) => {
      try {
        return ok(await listWorkflowRuns(owner, repo, { workflow_id, branch, status, per_page }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_workflow_run",
    {
      description:
        "Get a single workflow run's status/conclusion plus its jobs and steps — use this to see exactly what failed without downloading logs.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        run_id: z.number().int().describe("Workflow run ID"),
      },
    },
    async ({ owner, repo, run_id }) => {
      try {
        return ok(await getWorkflowRun(owner, repo, run_id));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "trigger_workflow",
    {
      description:
        "Manually trigger a workflow_dispatch run. The target workflow must have a 'workflow_dispatch' trigger configured. Note: depending on the workflow's configuration this may kick off real side effects (e.g. a deploy) — check the workflow file first if unsure.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        workflow_id: z.union([z.string(), z.number()]).describe("Workflow ID or filename, e.g. 'deploy.yml'"),
        ref: z.string().describe("Git ref (branch/tag) to run the workflow on"),
        inputs: z.record(z.string(), z.string()).optional().describe("workflow_dispatch inputs as defined in the workflow file"),
      },
    },
    async ({ owner, repo, workflow_id, ref, inputs }) => {
      try {
        return ok(await triggerWorkflow(owner, repo, workflow_id, ref, inputs));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "cancel_workflow_run",
    {
      description: "Cancel a running workflow run.",
      inputSchema: {
        owner: z.string().describe("Repository owner (user or organization)"),
        repo: z.string().describe("Repository name"),
        run_id: z.number().int().describe("Workflow run ID"),
      },
    },
    async ({ owner, repo, run_id }) => {
      try {
        return ok(await cancelWorkflowRun(owner, repo, run_id));
      } catch (err) {
        return fail(err);
      }
    },
  );
}
