import { db } from "../client";
import { Prisma } from "../../generated/prisma/client";

export type RecordWebhookEventInput = {
  provider: string;
  externalEventId: string;
  eventType: string;
  rawBody: string;
  rawBodySha256: string;
  headers: Record<string, string>;
};

export type RecordWebhookEventResult = { isDuplicate: boolean; id: string };

// Insert-then-catch-the-unique-violation, not find-then-create: a retried
// webhook racing its own first delivery is the case the unique constraint on
// (provider, externalEventId) exists to close, and a read-then-write has the
// same race the constraint is meant to prevent.
export async function recordWebhookEvent(
  input: RecordWebhookEventInput,
): Promise<RecordWebhookEventResult> {
  try {
    const event = await db.webhookEvent.create({
      data: {
        provider: input.provider,
        externalEventId: input.externalEventId,
        eventType: input.eventType,
        rawBody: input.rawBody,
        rawBodySha256: input.rawBodySha256,
        headers: input.headers,
      },
    });
    return { isDuplicate: false, id: event.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.webhookEvent.findUniqueOrThrow({
        where: {
          provider_externalEventId: {
            provider: input.provider,
            externalEventId: input.externalEventId,
          },
        },
      });
      return { isDuplicate: true, id: existing.id };
    }
    throw error;
  }
}

// Lets a real out-of-process task reload the verified webhook by id (section
// 17.1's processWebhookTask takes only {webhookEventId}) instead of receiving
// the live event object, which cannot cross a Render task boundary.
export function findWebhookEventById(id: string) {
  return db.webhookEvent.findUnique({ where: { id } });
}

export async function claimWebhookEventForProcessing(id: string): Promise<boolean> {
  const claimed = await db.webhookEvent.updateMany({
    where: {
      id,
      status: { in: ["RECEIVED", "FAILED"] },
      attemptCount: { lt: 5 },
    },
    data: {
      status: "PROCESSING",
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });
  return claimed.count === 1;
}

export async function markWebhookEventProcessed(id: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id },
    data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
  });
}

export async function markWebhookEventFailed(id: string, error: string): Promise<void> {
  const event = await db.webhookEvent.update({
    where: { id },
    data: { status: "FAILED", lastError: error.slice(0, 1_000) },
  });
  if (event.attemptCount >= 5) {
    await db.auditEvent.create({
      data: {
        actorType: "system",
        action: "webhook.dead_lettered",
        entityType: "WebhookEvent",
        entityId: id,
        after: { status: "FAILED", attemptCount: event.attemptCount },
        metadata: { provider: event.provider, error: error.slice(0, 1_000) },
      },
    });
  }
}
