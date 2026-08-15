import {
  MockHumanReviewProvider,
  TeracHumanReviewProvider,
  type HumanReviewProvider,
} from "@secondcurrent/integrations";

let humanReviewProvider: HumanReviewProvider | undefined;

export function getHumanReviewProvider(): HumanReviewProvider {
  if (humanReviewProvider) {
    return humanReviewProvider;
  }

  if (process.env.INTEGRATION_MODE === "live") {
    const apiKey = process.env.TERAC_API_KEY;
    const webhookSecret = process.env.TERAC_WEBHOOK_SECRET;
    const projectId = process.env.TERAC_PROJECT_ID;
    const apiBase = process.env.TERAC_API_BASE ?? "https://terac.com/api/external/v2";
    if (!apiKey || !webhookSecret || !projectId) {
      throw new Error(
        "TERAC_API_KEY, TERAC_WEBHOOK_SECRET, and TERAC_PROJECT_ID are required when INTEGRATION_MODE=live",
      );
    }
    humanReviewProvider = new TeracHumanReviewProvider({
      apiKey,
      apiBase,
      projectId,
      webhookSecret,
    });
  } else {
    humanReviewProvider = new MockHumanReviewProvider();
  }

  return humanReviewProvider;
}
