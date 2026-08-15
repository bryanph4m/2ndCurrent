import { describe, expect, it, vi } from "vitest";
import { InlineTaskRunner } from "./inline";

describe("InlineTaskRunner", () => {
  it("throws when starting an unregistered task", async () => {
    const runner = new InlineTaskRunner();
    await expect(runner.start("unknown-task", {}, "key_1")).rejects.toThrow();
  });

  it("runs the registered handler and stores its output", async () => {
    const runner = new InlineTaskRunner();
    const handler = vi.fn().mockResolvedValue({ outcome: "FINALIZING" });
    runner.registerTask<{ itemId: string }>("analyze-item", handler);

    const ref = await runner.start("analyze-item", { itemId: "item_1" }, "analyze:item_1:1");

    expect(handler).toHaveBeenCalledWith({ itemId: "item_1" });
    expect(runner.getOutput(ref.runId)).toEqual({ outcome: "FINALIZING" });
  });

  it("returns the existing run and does not re-run the handler for a repeated key", async () => {
    const runner = new InlineTaskRunner();
    const handler = vi.fn().mockResolvedValue({ outcome: "FINALIZING" });
    runner.registerTask("analyze-item", handler);

    const first = await runner.start("analyze-item", { itemId: "item_1" }, "analyze:item_1:1");
    const second = await runner.start("analyze-item", { itemId: "item_1" }, "analyze:item_1:1");

    expect(second).toBe(first);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
