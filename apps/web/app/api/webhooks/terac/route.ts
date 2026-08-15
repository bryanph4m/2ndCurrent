import { createHash } from "node:crypto";
import {
  claimWebhookEventForProcessing,
  finalizeItem,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  processTeracApproval,
  recordWebhookEvent,
  startTaskOnce,
} from "@secondcurrent/db";
import type { VerifiedReviewEvent } from "@secondcurrent/integrations";
import { getHumanReviewProvider } from "@/lib/reviews";
import { getTaskRunner, InlineTaskRunner } from "@/lib/tasks";
import {
  enforcePublicRateLimit,
  readLimitedText,
  requestTooLargeResponse,
} from "@/lib/requestSafety";

let taskRegistered = false;

// In mock mode the runner is an InlineTaskRunner and needs finalize-item
// registered here, the same as analyze-item is registered in the Stripe
// route; apps/workflows registers the real out-of-process finalize-item
// task for live mode (apps/workflows/src/tasks/finalize-item.ts).
function ensureFinalizeItemTaskRegistered(): void {
  if (taskRegistered) {
    return;
  }
  taskRegistered = true;

  const runner = getTaskRunner();
  if (runner instanceof InlineTaskRunner) {
    runner.registerTask<{ itemId: string }>("finalize-item", (input) => finalizeItem(input.itemId));
  }
}

// Section 16.5: verify, use X-Event-ID as the idempotency key, process, and
// return quickly. Section 17.3 step 6: once approvedResponses reaches the
// study's target, start finalize-item with a key unique to that study, so a
// retried or duplicate-delivered approval webhook can trigger finalization
// only once (startTaskOnce's WorkflowRun guard, plus finalizeItem's own
// READY/REJECTED no-op as a second layer).
export async function POST(request: Request): Promise<Response> {
  const limited = enforcePublicRateLimit(request, "terac-webhook", {
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;
  ensureFinalizeItemTaskRegistered();

  let rawBody: string;
  try {
    rawBody = await readLimitedText(request, 256_000);
  } catch {
    return requestTooLargeResponse();
  }
  const reviews = getHumanReviewProvider();

  let event: VerifiedReviewEvent;
  try {
    event = await reviews.verifyWebhook(rawBody, request.headers);
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const { id: webhookEventId } = await recordWebhookEvent({
    provider: "terac",
    externalEventId: event.eventId,
    eventType: event.type,
    rawBody,
    rawBodySha256: createHash("sha256").update(rawBody).digest("hex"),
    headers: Object.fromEntries(request.headers.entries()),
  });

  if (await claimWebhookEventForProcessing(webhookEventId)) {
    try {
      const result = await processTeracApproval({
        status: event.status,
        externalOpportunityId: event.externalOpportunityId,
        externalSubmissionId: event.externalSubmissionId,
      });

      if (result.outcome === "COUNTED" && result.readyToAggregate && result.itemId) {
        await startTaskOnce(
          {
            taskName: "finalize-item",
            itemId: result.itemId,
            input: { itemId: result.itemId },
            idempotencyKey: `finalize:${result.studyId}`,
          },
          (taskName, input, idempotencyKey) =>
            getTaskRunner().start(taskName, input, idempotencyKey),
        );
      }
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
