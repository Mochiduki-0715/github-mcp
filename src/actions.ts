import type { Octokit } from "@octokit/rest";
import { githubClient, toActionableError } from "./github-client.js";

export interface ActionsOctokit {
  rest: {
    actions: Pick<
      Octokit["rest"]["actions"],
      | "listRepoWorkflows"
      | "listWorkflowRunsForRepo"
      | "listWorkflowRuns"
      | "getWorkflowRun"
      | "listJobsForWorkflowRun"
      | "createWorkflowDispatch"
      | "cancelWorkflowRun"
    >;
  };
}

export interface WorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

function toWorkflowSummary(workflow: any): WorkflowSummary {
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
    html_url: workflow.html_url,
  };
}

export interface WorkflowRunSummary {
  id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  event: string;
  html_url: string;
  created_at: string;
}

function toWorkflowRunSummary(run: any): WorkflowRunSummary {
  return {
    id: run.id,
    name: run.name ?? null,
    status: run.status,
    conclusion: run.conclusion,
    head_branch: run.head_branch,
    head_sha: run.head_sha,
    event: run.event,
    html_url: run.html_url,
    created_at: run.created_at,
  };
}

export async function listWorkflows(
  owner: string,
  repo: string,
  client: ActionsOctokit = githubClient(owner),
): Promise<WorkflowSummary[]> {
  try {
    const { data } = await client.rest.actions.listRepoWorkflows({ owner, repo });
    return data.workflows.map(toWorkflowSummary);
  } catch (err) {
    throw toActionableError(err, "listing workflows");
  }
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  opts: { workflow_id?: number | string; branch?: string; status?: string; per_page?: number } = {},
  client: ActionsOctokit = githubClient(owner),
): Promise<WorkflowRunSummary[]> {
  try {
    const { data } = opts.workflow_id
      ? await client.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: opts.workflow_id,
          branch: opts.branch,
          status: opts.status as any,
          per_page: opts.per_page ?? 30,
        })
      : await client.rest.actions.listWorkflowRunsForRepo({
          owner,
          repo,
          branch: opts.branch,
          status: opts.status as any,
          per_page: opts.per_page ?? 30,
        });
    return data.workflow_runs.map(toWorkflowRunSummary);
  } catch (err) {
    throw toActionableError(err, "listing workflow runs");
  }
}

export interface WorkflowJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}

export interface WorkflowJobSummary {
  name: string;
  status: string;
  conclusion: string | null;
  steps: WorkflowJobStep[];
}

function toStep(step: any): WorkflowJobStep {
  return {
    name: step.name,
    status: step.status,
    conclusion: step.conclusion,
    number: step.number,
  };
}

function toJobSummary(job: any): WorkflowJobSummary {
  return {
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    steps: (job.steps ?? []).map(toStep),
  };
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number,
  client: ActionsOctokit = githubClient(owner),
): Promise<WorkflowRunSummary & { jobs: WorkflowJobSummary[] }> {
  try {
    const [{ data: run }, { data: jobsData }] = await Promise.all([
      client.rest.actions.getWorkflowRun({ owner, repo, run_id: runId }),
      client.rest.actions.listJobsForWorkflowRun({ owner, repo, run_id: runId }),
    ]);
    return {
      ...toWorkflowRunSummary(run),
      jobs: jobsData.jobs.map(toJobSummary),
    };
  } catch (err) {
    throw toActionableError(err, `fetching workflow run #${runId}`);
  }
}

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string | number,
  ref: string,
  inputs?: Record<string, string>,
  client: ActionsOctokit = githubClient(owner),
): Promise<{ triggered: boolean }> {
  try {
    await client.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflowId, ref, inputs });
    return { triggered: true };
  } catch (err) {
    throw toActionableError(err, `triggering workflow "${workflowId}"`);
  }
}

export async function cancelWorkflowRun(
  owner: string,
  repo: string,
  runId: number,
  client: ActionsOctokit = githubClient(owner),
): Promise<{ cancelled: boolean }> {
  try {
    await client.rest.actions.cancelWorkflowRun({ owner, repo, run_id: runId });
    return { cancelled: true };
  } catch (err) {
    throw toActionableError(err, `cancelling workflow run #${runId}`);
  }
}
