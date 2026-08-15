import { beforeEach, describe, expect, it, vi } from "vitest";

const { startTaskMock } = vi.hoisted(() => ({ startTaskMock: vi.fn() }));

vi.mock("@renderinc/sdk", () => ({
  Render: class MockRender {
    workflows = { startTask: startTaskMock };
  },
}));

const { RenderTaskRunner } = await import("./live");

beforeEach(() => {
  startTaskMock.mockReset();
});

describe("RenderTaskRunner", () => {
  it("starts a task under the configured workflow slug and returns its run id", async () => {
    startTaskMock.mockResolvedValue({ taskRunId: "run_123" });
    const runner = new RenderTaskRunner({
      apiKey: "test",
      workflowSlug: "secondcurrent-workflows",
    });

    const ref = await runner.start("analyze-item", { itemId: "item_1" }, "analyze:item_1:1");

    expect(ref).toEqual({ runId: "run_123" });
    expect(startTaskMock).toHaveBeenCalledWith("secondcurrent-workflows/analyze-item", [
      { itemId: "item_1" },
    ]);
  });

  it("starts a new run on every call - it does not deduplicate by idempotency key", async () => {
    startTaskMock
      .mockResolvedValueOnce({ taskRunId: "run_1" })
      .mockResolvedValueOnce({ taskRunId: "run_2" });
    const runner = new RenderTaskRunner({
      apiKey: "test",
      workflowSlug: "secondcurrent-workflows",
    });

    const first = await runner.start("analyze-item", { itemId: "item_1" }, "same-key");
    const second = await runner.start("analyze-item", { itemId: "item_1" }, "same-key");

    expect(first.runId).not.toBe(second.runId);
    expect(startTaskMock).toHaveBeenCalledTimes(2);
  });
});
