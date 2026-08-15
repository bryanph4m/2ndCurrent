import { task } from "@renderinc/sdk/workflows";
import { computeStoredStudyMetrics } from "@secondcurrent/db";

export async function computeStudyMetricsById(studyId: string) {
  return computeStoredStudyMetrics(studyId);
}

export const computeStudyMetricsTask = task(
  {
    name: "compute-study-metrics",
    timeoutSeconds: 300,
    retry: { maxRetries: 2, waitDurationMs: 5000 },
  },
  async function runComputeStudyMetrics(input: { studyId: string }) {
    return computeStudyMetricsById(input.studyId);
  },
);
