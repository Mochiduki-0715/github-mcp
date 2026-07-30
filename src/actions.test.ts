import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  listWorkflows,
  listWorkflowRuns,
  getWorkflowRun,
  triggerWorkflow,
  cancelWorkflowRun,
  type ActionsOctokit,
} from "./actions.js";

function fakeWorkflow(overrides: Partial<any> = {}) {
  return {
    id: 1,
    name: "Test",
    path: ".github/workflows/test.yml",
    state: "active",
    html_url: "https://github.com/o/r/actions/workflows/test.yml",
    ...overrides,
  };
}

function fakeRun(overrides: Partial<any> = {}) {
  return {
    id: 100,
    name: "Test",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: "abc123",
    event: "push",
    html_url: "https://github.com/o/r/actions/runs/100",
    created_at: "2026-07-31T00:00:00Z",
    ...overrides,
  };
}

describe("listWorkflows", () => {
  test("maps workflow summaries", async () => {
    const client: ActionsOctokit = {
      rest: {
        actions: {
          listRepoWorkflows: (async () => ({ data: { workflows: [fakeWorkflow()] } })) as any,
        } as any,
      },
    };
    const workflows = await listWorkflows("o", "r", client);
    assert.deepEqual(workflows, [
      { id: 1, name: "Test", path: ".github/workflows/test.yml", state: "active", html_url: "https://github.com/o/r/actions/workflows/test.yml" },
    ]);
  });
});

describe("listWorkflowRuns", () => {
  test("calls listWorkflowRuns when workflow_id is provided", async () => {
    let usedWorkflowScoped = false;
    const client: ActionsOctokit = {
      rest: {
        actions: {
          listWorkflowRuns: (async () => {
            usedWorkflowScoped = true;
            return { data: { workflow_runs: [fakeRun()] } };
          }) as any,
          listWorkflowRunsForRepo: (async () => {
            throw new Error("should not be called");
          }) as any,
        } as any,
      },
    };
    await listWorkflowRuns("o", "r", { workflow_id: "test.yml" }, client);
    assert.equal(usedWorkflowScoped, true);
  });

  test("calls listWorkflowRunsForRepo when workflow_id is omitted", async () => {
    let usedRepoWide = false;
    const client: ActionsOctokit = {
      rest: {
        actions: {
          listWorkflowRuns: (async () => {
            throw new Error("should not be called");
          }) as any,
          listWorkflowRunsForRepo: (async () => {
            usedRepoWide = true;
            return { data: { workflow_runs: [fakeRun()] } };
          }) as any,
        } as any,
      },
    };
    const runs = await listWorkflowRuns("o", "r", {}, client);
    assert.equal(usedRepoWide, true);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, 100);
  });
});

describe("getWorkflowRun", () => {
  test("combines run details with jobs and steps", async () => {
    const client: ActionsOctokit = {
      rest: {
        actions: {
          getWorkflowRun: (async () => ({ data: fakeRun() })) as any,
          listJobsForWorkflowRun: (async () => ({
            data: {
              jobs: [
                {
                  name: "build",
                  status: "completed",
                  conclusion: "failure",
                  steps: [{ name: "Run tests", status: "completed", conclusion: "failure", number: 3 }],
                },
              ],
            },
          })) as any,
        } as any,
      },
    };
    const result = await getWorkflowRun("o", "r", 100, client);
    assert.equal(result.id, 100);
    assert.equal(result.conclusion, "success");
    assert.deepEqual(result.jobs, [
      {
        name: "build",
        status: "completed",
        conclusion: "failure",
        steps: [{ name: "Run tests", status: "completed", conclusion: "failure", number: 3 }],
      },
    ]);
  });
});

describe("triggerWorkflow", () => {
  test("dispatches the workflow and returns triggered: true", async () => {
    let calledWith: any = null;
    const client: ActionsOctokit = {
      rest: {
        actions: {
          createWorkflowDispatch: (async (params: any) => {
            calledWith = params;
            return { data: undefined };
          }) as any,
        } as any,
      },
    };
    const result = await triggerWorkflow("o", "r", "deploy.yml", "main", { env: "prod" }, client);
    assert.deepEqual(result, { triggered: true });
    assert.equal(calledWith.workflow_id, "deploy.yml");
    assert.equal(calledWith.ref, "main");
    assert.deepEqual(calledWith.inputs, { env: "prod" });
  });
});

describe("cancelWorkflowRun", () => {
  test("cancels the run and returns cancelled: true", async () => {
    let calledRunId: number | undefined;
    const client: ActionsOctokit = {
      rest: {
        actions: {
          cancelWorkflowRun: (async ({ run_id }: any) => {
            calledRunId = run_id;
            return { data: undefined };
          }) as any,
        } as any,
      },
    };
    const result = await cancelWorkflowRun("o", "r", 100, client);
    assert.deepEqual(result, { cancelled: true });
    assert.equal(calledRunId, 100);
  });
});
