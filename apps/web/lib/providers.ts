import {
  LinqMessagingProvider,
  MockMessagingProvider,
  type MessagingProvider,
} from "@secondcurrent/integrations";

let messagingProvider: MessagingProvider | undefined;

export function getMessagingProvider(): MessagingProvider {
  if (messagingProvider) {
    return messagingProvider;
  }

  if (process.env.INTEGRATION_MODE === "live") {
    const apiKey = process.env.LINQ_API_KEY;
    const webhookSecret = process.env.LINQ_WEBHOOK_SECRET;
    if (!apiKey || !webhookSecret) {
      throw new Error(
        "LINQ_API_KEY and LINQ_WEBHOOK_SECRET are required when INTEGRATION_MODE=live",
      );
    }
    messagingProvider = new LinqMessagingProvider({ apiKey, webhookSecret });
  } else {
    messagingProvider = new MockMessagingProvider();
  }

  return messagingProvider;
}
