import { db } from "../client";
import { Prisma } from "../../generated/prisma/client";

export type EnqueueOutboxInput = {
  contactId: string;
  idempotencyKey: string;
  messageType: string;
  payload: Prisma.InputJsonValue;
};

// idempotencyKey is unique, so calling this twice for the same logical send
// (a retried webhook, a re-run task) enqueues the message once.
export async function enqueueOutboxMessage(input: EnqueueOutboxInput): Promise<void> {
  try {
    await db.outboxMessage.create({
      data: {
        contactId: input.contactId,
        idempotencyKey: input.idempotencyKey,
        messageType: input.messageType,
        payload: input.payload,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

// ponytail: single-sender assumption, no SELECT ... FOR UPDATE SKIP LOCKED -
// add row-level locking here if a second sender instance is ever run
// concurrently.
export function claimQueuedOutboxBatch(limit: number) {
  return db.outboxMessage.findMany({
    where: { status: "QUEUED", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
}

export async function markOutboxSent(id: string, providerMessageId: string): Promise<void> {
  await db.outboxMessage.update({
    where: { id },
    data: { status: "SENT", providerMessageId, sentAt: new Date() },
  });
}

export async function markOutboxFailed(
  id: string,
  error: string,
  currentAttemptCount: number,
  now = new Date(),
): Promise<{ deadLettered: boolean }> {
  const nextAttemptCount = currentAttemptCount + 1;
  const retryDelaysMs = [5_000, 30_000, 120_000, 600_000] as const;
  const retryDelayMs = retryDelaysMs[nextAttemptCount - 1];

  if (retryDelayMs === undefined) {
    await db.$transaction(async (tx) => {
      await tx.outboxMessage.update({
        where: { id },
        data: { status: "FAILED", attemptCount: { increment: 1 }, lastError: error },
      });
      await tx.auditEvent.create({
        data: {
          actorType: "system",
          action: "outbox.dead_lettered",
          entityType: "OutboxMessage",
          entityId: id,
          after: { status: "FAILED", attemptCount: nextAttemptCount },
          metadata: { error: error.slice(0, 1_000) },
        },
      });
    });
    return { deadLettered: true };
  }

  await db.outboxMessage.update({
    where: { id },
    data: {
      attemptCount: { increment: 1 },
      lastError: error,
      nextAttemptAt: new Date(now.getTime() + retryDelayMs),
    },
  });
  return { deadLettered: false };
}
