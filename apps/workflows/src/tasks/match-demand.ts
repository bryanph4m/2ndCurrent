import { task } from "@renderinc/sdk/workflows";
import { matchDemand } from "@secondcurrent/db";

export async function matchDemandById(demandRequestId: string) {
  return matchDemand(demandRequestId);
}

export const matchDemandTask = task(
  { name: "match-demand", timeoutSeconds: 300, retry: { maxRetries: 2, waitDurationMs: 5000 } },
  async function runMatchDemand(input: { demandRequestId: string }) {
    return matchDemandById(input.demandRequestId);
  },
);
