import { Render } from "@renderinc/sdk";
import type { TaskRunRef, TaskRunner } from "./types";

// Section 17.1.1: Render SDK calls stay behind the TaskRunner interface.
// Render expects task arguments as an array; each typed input is wrapped as
// one positional argument.
//
// This adapter does not deduplicate by idempotencyKey - Render's startTask
// has no such parameter, so every call here creates a new task run. The
// "duplicate starts return the existing run" guarantee (section 41 Phase 6
// acceptance) is enforced one layer up, by packages/db's startTaskOnce
// against the WorkflowRun table. Nothing should call this class directly
// from a route handler; go through startTaskOnce instead.
export class RenderTaskRunner implements TaskRunner {
  private readonly client: Render;
  private readonly workflowSlug: string;

  constructor(deps: { apiKey: string; workflowSlug: string }) {
    this.client = new Render({ token: deps.apiKey });
    this.workflowSlug = deps.workflowSlug;
  }

  async start<TInput>(
    taskName: string,
    input: TInput,
    _idempotencyKey: string,
  ): Promise<TaskRunRef> {
    const run = await this.client.workflows.startTask(`${this.workflowSlug}/${taskName}`, [input]);
    return { runId: run.taskRunId };
  }
}
