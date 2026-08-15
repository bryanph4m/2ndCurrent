import {
  assertConversationTransition,
  ConcurrencyError,
  type ConversationState,
} from "@secondcurrent/domain";
import { db } from "../client";

export function getConversationForContact(contactId: string) {
  return db.conversation.findFirst({
    where: { contactId },
    orderBy: { createdAt: "desc" },
  });
}

export function createConversation(contactId: string) {
  return db.conversation.create({ data: { contactId, state: "NEW" } });
}

export type TransitionConversationInput = {
  conversationId: string;
  expectedVersion: number;
  to: ConversationState;
  activeItemId?: string | undefined;
  actor: { type: string; id?: string };
};

// Optimistic concurrency per section 13.2: the WHERE clause pins both id and
// the version the caller last read. A concurrent update to the same
// conversation makes this affect zero rows, which we surface as
// ConcurrencyError rather than silently succeeding on stale data.
export async function transitionConversation(input: TransitionConversationInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
    });
    assertConversationTransition(conversation.state as ConversationState, input.to);

    const result = await tx.conversation.updateMany({
      where: { id: input.conversationId, version: input.expectedVersion },
      data: {
        state: input.to,
        version: { increment: 1 },
        ...(input.activeItemId ? { activeItemId: input.activeItemId } : {}),
      },
    });

    if (result.count === 0) {
      throw new ConcurrencyError("Conversation", input.conversationId);
    }

    await tx.auditEvent.create({
      data: {
        itemId: input.activeItemId ?? null,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        action: "conversation.transition",
        entityType: "Conversation",
        entityId: input.conversationId,
        before: { state: conversation.state },
        after: { state: input.to },
      },
    });
  });
}
