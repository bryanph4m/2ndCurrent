import { db } from "../client";
import type { Prisma } from "../../generated/prisma/client";

export type RecordInboundMessageInput = {
  contactId: string;
  conversationId: string;
  provider: string;
  providerMessageId?: string | undefined;
  text?: string | undefined;
  normalizedCommand?: string | undefined;
  rawPayload: Prisma.InputJsonValue;
};

export function recordInboundMessage(input: RecordInboundMessageInput) {
  return db.message.create({
    data: {
      contactId: input.contactId,
      conversationId: input.conversationId,
      direction: "INBOUND",
      status: "RECEIVED",
      provider: input.provider,
      providerMessageId: input.providerMessageId ?? null,
      text: input.text ?? null,
      normalizedCommand: input.normalizedCommand ?? null,
      rawPayload: input.rawPayload,
    },
  });
}
