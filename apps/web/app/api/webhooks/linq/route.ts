import { createHash } from "node:crypto";
import {
  claimWebhookEventForProcessing,
  createLinqIntakePorts,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  recordWebhookEvent,
  sendQueuedOutboxMessages,
  startTaskOnce,
} from "@secondcurrent/db";
import { processInboundLinqEvent } from "@secondcurrent/domain";
import { normalizePrivateImage, type VerifiedMessagingEvent } from "@secondcurrent/integrations";
import { getIntakeCrypto } from "@/lib/crypto";
import { getAppBaseUrl, getPaymentProvider } from "@/lib/payment";
import { getMessagingProvider } from "@/lib/providers";
import { getObjectStorage } from "@/lib/storage";
import { getTaskRunner, InlineTaskRunner } from "@/lib/tasks";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

let taskRegistered = false;

// In mock mode the runner is an InlineTaskRunner and gets the full pipeline
// registered here, using the already-verified event straight from this
// request. In live mode the runner is a RenderTaskRunner: nothing is
// registered in this process, and the started task instead reloads and
// re-verifies the stored webhook itself
// (apps/workflows/src/tasks/process-webhook.ts's processStoredWebhook),
// matching section 17.1's real {webhookEventId}-only task signature.
function ensureTaskRegistered(): void {
  if (taskRegistered) {
    return;
  }
  taskRegistered = true;

  const runner = getTaskRunner();
  if (runner instanceof InlineTaskRunner) {
    runner.registerTask<{ event: VerifiedMessagingEvent }>("process-webhook", async (input) => {
      const ports = createLinqIntakePorts({
        downloadAttachment: (url) => getMessagingProvider().downloadAttachment({ url }),
        normalizeAttachment: normalizePrivateImage,
        storePrivateObject: (object) =>
          getObjectStorage()
            .putPrivateObject(object)
            .then(() => undefined),
        createCheckout: (input) => getPaymentProvider().createCheckout(input),
        appBaseUrl: getAppBaseUrl(),
      });
      const result = await processInboundLinqEvent(
        {
          eventId: input.event.eventId,
          chatId: input.event.chatId,
          fromPhone: input.event.fromPhone,
          text: input.event.text,
          mediaUrls: input.event.mediaUrls,
          raw: input.event.raw,
        },
        getIntakeCrypto(),
        ports,
      );

      // No scheduled sender exists yet, so the outbox is drained inline,
      // right after the message that filled it. Outside a transaction per
      // section 17.4.
      await sendQueuedOutboxMessages((send) => getMessagingProvider().sendText(send));

      return result;
    });
  }
}

// Section 16.3: read the raw body, verify before parsing anything, insert
// the WebhookEvent for dedup, return 200 quickly, process afterward.
export async function POST(request: Request): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "linq-webhook", {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;
  ensureTaskRegistered();

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 1_000_000);
  } catch {
    return requestTooLargeResponse();
  }
  const messaging = getMessagingProvider();

  let event: VerifiedMessagingEvent;
  try {
    event = await messaging.verifyWebhook(rawBody, request.headers);
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const { id: webhookEventId } = await recordWebhookEvent({
    provider: "linq",
    externalEventId: event.eventId,
    eventType: event.type,
    rawBody,
    rawBodySha256: createHash("sha256").update(rawBody).digest("hex"),
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (await claimWebhookEventForProcessing(webhookEventId)) {
    try {
      const runner = getTaskRunner();
      // InlineTaskRunner's handler (registered above) expects the
      // already-verified event; RenderTaskRunner dispatches to
      // apps/workflows' process-webhook task, which reloads and re-verifies
      // by id instead (section 17.1) since a live task cannot receive it directly.
      const taskInput = runner instanceof InlineTaskRunner ? { event } : { webhookEventId };
      await startTaskOnce(
        {
          taskName: "process-webhook",
          input: taskInput,
          idempotencyKey: `process-webhook:linq:${event.eventId}`,
        },
        (taskName, input, idempotencyKey) => runner.start(taskName, input, idempotencyKey),
      );
      await markWebhookEventProcessed(webhookEventId);
    } catch (error) {
      await markWebhookEventFailed(
        webhookEventId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  return new Response(null, { status: 200 });
}
