import { db } from "../client";

export type CreateContactInput = {
  phoneHash: string;
  phoneCiphertext: string;
};

export function createContact(input: CreateContactInput) {
  return db.contact.create({ data: input });
}

export function getContact(id: string) {
  return db.contact.findUniqueOrThrow({ where: { id } });
}

export type FindOrCreateContactInput = {
  phoneHash: string;
  phoneCiphertext: string;
  linqChatId: string;
};

export async function findOrCreateContact(input: FindOrCreateContactInput) {
  const existing = await db.contact.findUnique({ where: { phoneHash: input.phoneHash } });
  if (existing) {
    if (existing.linqChatId !== input.linqChatId) {
      return db.contact.update({
        where: { id: existing.id },
        data: { linqChatId: input.linqChatId },
      });
    }
    return existing;
  }
  return db.contact.create({
    data: {
      phoneHash: input.phoneHash,
      phoneCiphertext: input.phoneCiphertext,
      linqChatId: input.linqChatId,
    },
  });
}

// Sets the contact opted out and cancels every queued outbound message in
// one transaction (section 23.3) - "STOP prevents later outbound messages"
// covers both what is already queued and what would be sent after.
export async function recordOptOut(contactId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id: contactId },
      data: { status: "OPTED_OUT", optedOutAt: new Date() },
    });
    await tx.outboxMessage.updateMany({
      where: { contactId, status: "QUEUED" },
      data: { status: "CANCELED" },
    });
    await tx.auditEvent.create({
      data: {
        actorType: "system",
        action: "contact.opt_out",
        entityType: "Contact",
        entityId: contactId,
        after: { status: "OPTED_OUT" },
      },
    });
  });
}
