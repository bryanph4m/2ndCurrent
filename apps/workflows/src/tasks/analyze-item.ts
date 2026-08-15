import { task } from "@renderinc/sdk/workflows";
import { createAndLaunchItemStudy, runItemAnalysis } from "@secondcurrent/db";
import { getAppBaseUrl, getHumanReviewProvider, getVisionProvider } from "../runtime/providers.js";

// Section 17.2: when analysis lands on WAITING_FOR_REVIEW, the same task run
// creates and launches the Terac study - the out-of-process counterpart of
// the inline handler apps/web registers for mock mode.
export const analyzeItemTask = task(
  { name: "analyze-item", timeoutSeconds: 900, retry: { maxRetries: 1, waitDurationMs: 10000 } },
  async function analyzeItemWorkflow(input: { itemId: string }) {
    const vision = getVisionProvider();
    const result = await runItemAnalysis(input.itemId, (image) => vision.analyzeImage(image));
    if (result.outcome === "WAITING_FOR_REVIEW") {
      const reviews = getHumanReviewProvider();
      await createAndLaunchItemStudy(input.itemId, {
        createDraft: (draft) => reviews.createDraft(draft),
        launch: (id) => reviews.launch(id),
        appBaseUrl: getAppBaseUrl(),
      });
    }
    return result;
  },
);
