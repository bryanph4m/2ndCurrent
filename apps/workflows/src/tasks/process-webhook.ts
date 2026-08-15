import { task } from "@renderinc/sdk/workflows";
import {
  createLinqIntakePorts,
  findWebhookEventById,
  sendQueuedOutboxMessages,
} from "@secondcurrent/db";
import { processInboundLinqEvent, type IntakeOutcome } from "@secondcurrent/domain";
import { normalizePrivateImage } from "@secondcurrent/integrations";
import { getIntakeCrypto } from "../runtime/crypto.js";
import {
  getAppBaseUrl,
  getMessagingProvider,
  getObjectStorage,
  getPaymentProvider,
} from "../runtime/providers.js";

// Section 17.1's real processWebhookTask: takes only {webhookEventId} (a
// JSON-safe id, not the live verified-event object a web request already
// holds) and reloads everything from storage. Re-verifying the stored
// rawBody/headers is deterministic and cheap, and avoids inventing a second
// serialization for VerifiedMessagingEvent just to cross the task boundary.
//
// apps/web's linq webhook route currently runs this same pipeline inline
// through InlineTaskRunner in mock mode; this is the out-of-process
// counterpart that a real Render task run dispatches to in live mode.
export async function processStoredWebhook(webhookEventId: string): Promise<IntakeOutcome> {
  const event = await findWebhookEventById(webhookEventId);
  if (!event) {
    throw new Error(`No WebhookEvent found for id ${webhookEventId}`);
  }
  if (event.provider !== "linq") {
    throw new Error(`process-webhook only handles linq events, got provider "${event.provider}"`);
  }

  const messaging = getMessagingProvider();
  const verified = await messaging.verifyWebhook(
    event.rawBody,
    new Headers(event.headers as Record<string, string>),
  );

  const ports = createLinqIntakePorts({
    downloadAttachment: (url) => messaging.downloadAttachment({ url }),
    normalizeAttachment: normalizePrivateImage,
    storePrivateObject: (input) =>
      getObjectStorage()
        .putPrivateObject(input)
        .then(() => undefined),
    createCheckout: (input) => getPaymentProvider().createCheckout(input),
    appBaseUrl: getAppBaseUrl(),
  });

  const outcome = await processInboundLinqEvent(
    {
      eventId: verified.eventId,
      chatId: verified.chatId,
      fromPhone: verified.fromPhone,
      text: verified.text,
      mediaUrls: verified.mediaUrls,
      raw: verified.raw,
    },
    getIntakeCrypto(),
    ports,
  );

  // Section 17.4: outside any transaction, no scheduled sender exists yet
  // (that is its own task once match-demand/compute-study-metrics land), so
  // draining inline right after the message that filled the outbox.
  await sendQueuedOutboxMessages((send) => messaging.sendText(send));

  return outcome;
}

export const processWebhookTask = task(
  { name: "process-webhook", timeoutSeconds: 300, retry: { maxRetries: 2, waitDurationMs: 5000 } },
  async function processWebhook(input: { webhookEventId: string }) {
    return processStoredWebhook(input.webhookEventId);
  },
);
