import { describe, expect, it, vi } from "vitest";

const { computeStoredStudyMetricsMock } = vi.hoisted(() => ({
  computeStoredStudyMetricsMock: vi.fn(),
}));

vi.mock("@secondcurrent/db", () => ({
  computeStoredStudyMetrics: computeStoredStudyMetricsMock,
}));
vi.mock("@renderinc/sdk/workflows", () => ({
  task: vi.fn((_options: unknown, handler: unknown) => handler),
}));

const { computeStudyMetricsById } = await import("./compute-study-metrics");

describe("compute-study-metrics task", () => {
  it("computes metrics from the stored study id", async () => {
    computeStoredStudyMetricsMock.mockResolvedValue({ baseline: {}, revised: {} });
    await computeStudyMetricsById("study_1");
    expect(computeStoredStudyMetricsMock).toHaveBeenCalledWith("study_1");
  });
});
