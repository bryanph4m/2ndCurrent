import { db } from "./client";
import {
  claimQueuedOutboxBatch,
  markOutboxFailed,
  markOutboxSent,
} from "./repositories/outboxRepository";

export type OutboxSendText = (input: {
  chatId: string;
  text: string;
  idempotencyKey: string;
}) => Promise<{ providerMessageId: string }>;

// Section 17.4: claim rows, then send outside any transaction - a Linq call
// must never happen inside db.$transaction(), since the transaction would
// hold a connection open for the duration of a network call.
export async function sendQueuedOutboxMessages(
  sendText: OutboxSendText,
  batchSize = 20,
): Promise<{ sent: number; failed: number }> {
  const batch = await claimQueuedOutboxBatch(batchSize);
  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    try {
      const contact = await db.contact.findUniqueOrThrow({ where: { id: row.contactId } });
      if (!contact.linqChatId) {
        throw new Error(`Contact ${contact.id} has no linqChatId to send to`);
      }
      const payload = row.payload as { text: string };
      const result = await sendText({
        chatId: contact.linqChatId,
        text: payload.text,
        idempotencyKey: row.idempotencyKey,
      });
      await markOutboxSent(row.id, result.providerMessageId);
      sent++;
    } catch (error) {
      await markOutboxFailed(
        row.id,
        error instanceof Error ? error.message : String(error),
        row.attemptCount,
      );
      failed++;
    }
  }

  return { sent, failed };
}
