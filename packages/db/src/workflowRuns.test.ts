import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    workflowRun: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { startTaskOnce } = await import("./workflowRuns");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startTaskOnce", () => {
  it("starts a new run and records the provider run id", async () => {
    dbMock.workflowRun.create.mockResolvedValue({ id: "wfr_1" });
    dbMock.workflowRun.update.mockResolvedValue({});
    const start = vi.fn().mockResolvedValue({ runId: "render_run_1" });

    const result = await startTaskOnce(
      {
        taskName: "analyze-item",
        itemId: "item_1",
        input: { itemId: "item_1" },
        idempotencyKey: "key_1",
      },
      start,
    );

    expect(result).toEqual({
      workflowRunId: "wfr_1",
      providerRunId: "render_run_1",
      started: true,
    });
    expect(start).toHaveBeenCalledWith("analyze-item", { itemId: "item_1" }, "key_1");
    expect(dbMock.workflowRun.update).toHaveBeenCalledWith({
      where: { id: "wfr_1" },
      data: expect.objectContaining({ status: "RUNNING", providerRunId: "render_run_1" }),
    });
  });

  it("returns the existing run for a repeated idempotency key without starting a second one", async () => {
    dbMock.workflowRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    dbMock.workflowRun.findUniqueOrThrow.mockResolvedValue({
      id: "wfr_existing",
      providerRunId: "render_run_existing",
      status: "RUNNING",
    });
    const start = vi.fn();

    const result = await startTaskOnce(
      { taskName: "analyze-item", input: { itemId: "item_1" }, idempotencyKey: "key_1" },
      start,
    );

    expect(result).toEqual({
      workflowRunId: "wfr_existing",
      providerRunId: "render_run_existing",
      started: false,
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("marks the run failed and rethrows when the underlying task runner rejects", async () => {
    dbMock.workflowRun.create.mockResolvedValue({ id: "wfr_1" });
    dbMock.workflowRun.update.mockResolvedValue({});
    const start = vi.fn().mockRejectedValue(new Error("render api down"));

    await expect(
      startTaskOnce({ taskName: "analyze-item", input: {}, idempotencyKey: "key_1" }, start),
    ).rejects.toThrow("render api down");

    expect(dbMock.workflowRun.update).toHaveBeenCalledWith({
      where: { id: "wfr_1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("restarts an existing failed run without creating a duplicate row", async () => {
    dbMock.workflowRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    dbMock.workflowRun.findUniqueOrThrow.mockResolvedValue({
      id: "wfr_failed",
      providerRunId: null,
      status: "FAILED",
    });
    dbMock.workflowRun.updateMany.mockResolvedValue({ count: 1 });
    dbMock.workflowRun.update.mockResolvedValue({});
    const start = vi.fn().mockResolvedValue({ runId: "render_retry_1" });

    await expect(
      startTaskOnce(
        { taskName: "analyze-item", input: { itemId: "item_1" }, idempotencyKey: "key_1" },
        start,
      ),
    ).resolves.toEqual({
      workflowRunId: "wfr_failed",
      providerRunId: "render_retry_1",
      started: true,
    });
    expect(dbMock.workflowRun.updateMany).toHaveBeenCalledWith({
      where: { id: "wfr_failed", status: "FAILED" },
      data: { status: "QUEUED", lastError: null },
    });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
