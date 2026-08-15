import { db } from "./client";
import { Prisma } from "../generated/prisma/client";

export type StartTaskFn = (
  taskName: string,
  input: Record<string, unknown>,
  idempotencyKey: string,
) => Promise<{ runId: string }>;

export type StartTaskOnceInput = {
  taskName: string;
  itemId?: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
};

export type StartTaskOnceResult = {
  workflowRunId: string;
  providerRunId: string | null;
  started: boolean;
};

// The durable half of "duplicate starts return the existing run" (section 41
// Phase 6 acceptance). InlineTaskRunner already dedups by idempotencyKey in
// memory, but that does not survive a process restart, and RenderTaskRunner
// talks to an API with no idempotency key parameter at all - it starts a new
// run on every call. The @@unique constraint on WorkflowRun.idempotencyKey
// is what actually makes a second start with the same key a no-op,
// regardless of which TaskRunner is behind it. Same insert-then-catch-P2002
// pattern used everywhere else idempotency matters in this codebase.
export async function startTaskOnce(
  input: StartTaskOnceInput,
  start: StartTaskFn,
): Promise<StartTaskOnceResult> {
  let run;
  try {
    run = await db.workflowRun.create({
      data: {
        itemId: input.itemId ?? null,
        taskName: input.taskName,
        idempotencyKey: input.idempotencyKey,
        input: input.input as Prisma.InputJsonValue,
        status: "QUEUED",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.workflowRun.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing.status !== "FAILED") {
        return {
          workflowRunId: existing.id,
          providerRunId: existing.providerRunId,
          started: false,
        };
      }
      const claimed = await db.workflowRun.updateMany({
        where: { id: existing.id, status: "FAILED" },
        data: { status: "QUEUED", lastError: null },
      });
      if (claimed.count !== 1) {
        return {
          workflowRunId: existing.id,
          providerRunId: existing.providerRunId,
          started: false,
        };
      }
      run = existing;
    } else {
      throw error;
    }
  }

  try {
    // ponytail: RenderTaskRunner returns as soon as the run is queued on
    // Render's side (genuinely "RUNNING" here), but InlineTaskRunner already
    // ran the handler to completion by the time this resolves - this row
    // undercounts finished-ness for mock mode. Add a completion callback if
    // an accurate WorkflowRun.status ever needs to drive UI, not needed yet.
    const { runId } = await start(input.taskName, input.input, input.idempotencyKey);
    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        providerRunId: runId,
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return { workflowRunId: run.id, providerRunId: runId, started: true };
  } catch (error) {
    await db.workflowRun
      .update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          lastError: String(error),
          attemptCount: { increment: 1 },
        },
      })
      .catch(() => {});
    throw error;
  }
}
