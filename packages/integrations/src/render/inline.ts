import type { TaskRunRef, TaskRunner } from "./types";

export type TaskHandler<TInput = unknown> = (input: TInput) => Promise<unknown>;

// Runs a registered task handler inline and to completion instead of
// dispatching to Render. Deduplicates by idempotencyKey so a repeated start
// (the same webhook retried, the same evidence request re-fired) returns the
// existing run instead of re-running the handler, matching section 32.1.
export class InlineTaskRunner implements TaskRunner {
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly runsByIdempotencyKey = new Map<string, TaskRunRef>();
  private readonly outputs = new Map<string, unknown>();
  private nextRunId = 1;

  registerTask<TInput>(taskName: string, handler: TaskHandler<TInput>): void {
    this.handlers.set(taskName, handler as TaskHandler);
  }

  async start<TInput>(
    taskName: string,
    input: TInput,
    idempotencyKey: string,
  ): Promise<TaskRunRef> {
    const existing = this.runsByIdempotencyKey.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    const handler = this.handlers.get(taskName);
    if (!handler) {
      throw new Error(`No task registered for ${taskName}`);
    }

    const ref: TaskRunRef = { runId: `mock_run_${this.nextRunId++}` };
    this.runsByIdempotencyKey.set(idempotencyKey, ref);
    const output = await handler(input);
    this.outputs.set(ref.runId, output);
    return ref;
  }

  getOutput(runId: string): unknown {
    return this.outputs.get(runId);
  }
}
