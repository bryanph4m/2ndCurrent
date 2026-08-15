import { task } from "@renderinc/sdk/workflows";
import { finalizeItem } from "@secondcurrent/db";

// Section 17.2: analyzeItem's REJECTED and finalize paths call this task
// once their AnalysisRun is written. It also has a caller Phase 6 does not
// have: Phase 7's Terac-approved review path will start this same task once
// a human review reaches a decision. finalizeItem() is idempotent, so a
// review that finalizes an already-finalized item is a no-op.
export const finalizeItemTask = task(
  { name: "finalize-item", timeoutSeconds: 600, retry: { maxRetries: 1, waitDurationMs: 5000 } },
  async function finalizeItemWorkflow(input: { itemId: string }) {
    return finalizeItem(input.itemId);
  },
);
