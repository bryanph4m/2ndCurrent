import { isOptOutText } from "../commands/optOut";
import { parseCommand } from "../commands/parseCommand";
import type { ParsedCommand } from "../commands/parseCommand";
import {
  CONSENT_AND_PHOTO_INSTRUCTIONS_TEXT,
  CHECKOUT_LINK_PREFIX,
  OPT_OUT_CONFIRMATION_TEXT,
} from "../messaging/templates";
import { PHOTO_LABEL_ORDER } from "../schemas/media";
import type { ConversationState } from "../states/conversation";

export type IntakeContactStatus = "ACTIVE" | "OPTED_OUT" | "BLOCKED";

export type IntakeContact = {
  id: string;
  status: IntakeContactStatus;
};

export type IntakeConversation = {
  id: string;
  state: ConversationState;
  version: number;
  activeItemId: string | null;
};

export type InboundLinqEvent = {
  eventId: string;
  chatId: string;
  fromPhone: string;
  text: string | undefined;
  mediaUrls: readonly string[];
  raw: unknown;
};

export type IntakeCrypto = {
  hashPhone(phone: string): string;
  encryptPhone(phone: string): string;
  sha256(bytes: Buffer): string;
};

export type IntakePorts = {
  findOrCreateContact(input: {
    phoneHash: string;
    phoneCiphertext: string;
    linqChatId: string;
  }): Promise<IntakeContact>;
  getConversation(contactId: string): Promise<IntakeConversation | null>;
  createConversation(contactId: string): Promise<IntakeConversation>;
  transitionConversation(input: {
    conversationId: string;
    expectedVersion: number;
    to: ConversationState;
    activeItemId?: string;
  }): Promise<void>;
  recordInboundMessage(input: {
    contactId: string;
    conversationId: string;
    text: string | undefined;
    raw: unknown;
  }): Promise<void>;
  recordOptOut(contactId: string): Promise<void>;
  createItem(input: { ownerContactId: string }): Promise<{ id: string }>;
  countMedia(itemId: string): Promise<number>;
  normalizeAttachment(input: { bytes: Buffer; mimeType: string }): Promise<{
    bytes: Buffer;
    mimeType: string;
    width: number;
    height: number;
    metadataRemovedAt: Date;
  }>;
  storePrivateObject(input: { objectKey: string; bytes: Buffer; mimeType: string }): Promise<void>;
  attachMedia(input: {
    itemId: string;
    label: (typeof PHOTO_LABEL_ORDER)[number] | "OTHER";
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    width: number;
    height: number;
    metadataRemovedAt: Date;
  }): Promise<{ attached: boolean; totalCount: number }>;
  enqueueOutbound(input: {
    contactId: string;
    idempotencyKey: string;
    text: string;
  }): Promise<void>;
  downloadAttachment(url: string): Promise<{ bytes: Buffer; mimeType: string }>;
  createRecoveryCheckOrder(input: {
    contactId: string;
    itemId: string;
  }): Promise<{ checkoutUrl: string }>;
  handleMarketplaceCommand(input: {
    contactId: string;
    rawText: string;
    command: Extract<ParsedCommand, { type: "NEED" | "APPROVE" | "DECLINE" | "DONE" }>;
  }): Promise<void>;
};

export type IntakeOutcome =
  | { outcome: "SUPPRESSED_OPTED_OUT" }
  | { outcome: "OPTED_OUT" }
  | { outcome: "SELL_STARTED"; itemId: string }
  | { outcome: "PHOTO_ATTACHED"; totalCount: number }
  | { outcome: "PHOTOS_COMPLETE"; itemId: string }
  | { outcome: "MARKETPLACE_COMMAND"; commandType: "NEED" | "APPROVE" | "DECLINE" | "DONE" }
  | { outcome: "NO_OP" };

const REQUIRED_PHOTO_COUNT = 3;
const MAX_PHOTO_COUNT = 8;

// The pipeline from section 12.1/12.2: find-or-create the contact and
// conversation, check opt-out before anything else, then route SELL and
// photo intake. Depends only on the injected ports and crypto, never on
// Prisma or a provider SDK directly, so its control flow is testable without
// a database (see linqIntake.test.ts) even though the real ports
// implementation is DB-backed.
export async function processInboundLinqEvent(
  event: InboundLinqEvent,
  crypto: IntakeCrypto,
  ports: IntakePorts,
): Promise<IntakeOutcome> {
  const contact = await ports.findOrCreateContact({
    phoneHash: crypto.hashPhone(event.fromPhone),
    phoneCiphertext: crypto.encryptPhone(event.fromPhone),
    linqChatId: event.chatId,
  });

  const conversation =
    (await ports.getConversation(contact.id)) ?? (await ports.createConversation(contact.id));

  await ports.recordInboundMessage({
    contactId: contact.id,
    conversationId: conversation.id,
    text: event.text,
    raw: event.raw,
  });

  // Opt-out is checked before any other command handling (section 12.1 step
  // 8), and a contact who is already opted out gets nothing further sent to
  // them until they text again with something that is not itself an opt-out
  // keyword (section 23.3).
  if (contact.status === "OPTED_OUT" && !isOptOutText(event.text ?? "")) {
    return { outcome: "SUPPRESSED_OPTED_OUT" };
  }

  const text = event.text ?? "";

  if (isOptOutText(text)) {
    await ports.recordOptOut(contact.id);
    await ports.enqueueOutbound({
      contactId: contact.id,
      idempotencyKey: `opt-out-confirmation:${contact.id}`,
      text: OPT_OUT_CONFIRMATION_TEXT,
    });
    return { outcome: "OPTED_OUT" };
  }

  const command = parseCommand(text);

  if (command.type === "SELL" && !conversation.activeItemId) {
    const item = await ports.createItem({ ownerContactId: contact.id });
    await ports.transitionConversation({
      conversationId: conversation.id,
      expectedVersion: conversation.version,
      to: "WAITING_FOR_PHOTOS",
      activeItemId: item.id,
    });
    await ports.enqueueOutbound({
      contactId: contact.id,
      idempotencyKey: `photo-instructions:${item.id}`,
      text: CONSENT_AND_PHOTO_INSTRUCTIONS_TEXT,
    });
    return { outcome: "SELL_STARTED", itemId: item.id };
  }

  if (conversation.activeItemId && event.mediaUrls.length > 0) {
    const itemId = conversation.activeItemId;
    const existingCount = await ports.countMedia(itemId);
    if (existingCount + event.mediaUrls.length > MAX_PHOTO_COUNT) {
      throw new Error(`An item can have at most ${MAX_PHOTO_COUNT} photos`);
    }
    let totalCount = existingCount;

    for (const [index, url] of event.mediaUrls.entries()) {
      const attachment = await ports.downloadAttachment(url);
      const normalized = await ports.normalizeAttachment(attachment);
      const sha256 = crypto.sha256(normalized.bytes);
      const label = PHOTO_LABEL_ORDER[index] ?? "OTHER";
      const objectKey = `items/${itemId}/${sha256}.webp`;
      await ports.storePrivateObject({
        objectKey,
        bytes: normalized.bytes,
        mimeType: normalized.mimeType,
      });
      const result = await ports.attachMedia({
        itemId,
        label,
        objectKey,
        mimeType: normalized.mimeType,
        sizeBytes: normalized.bytes.byteLength,
        sha256,
        width: normalized.width,
        height: normalized.height,
        metadataRemovedAt: normalized.metadataRemovedAt,
      });
      totalCount = result.totalCount;
    }

    if (totalCount >= REQUIRED_PHOTO_COUNT) {
      await ports.transitionConversation({
        conversationId: conversation.id,
        expectedVersion: conversation.version,
        to: "WAITING_FOR_PAYMENT",
      });
      const { checkoutUrl } = await ports.createRecoveryCheckOrder({
        contactId: contact.id,
        itemId,
      });
      await ports.enqueueOutbound({
        contactId: contact.id,
        idempotencyKey: `checkout-link:${itemId}`,
        text: `${CHECKOUT_LINK_PREFIX}${checkoutUrl}`,
      });
      return { outcome: "PHOTOS_COMPLETE", itemId };
    }

    return { outcome: "PHOTO_ATTACHED", totalCount };
  }

  if (
    command.type === "NEED" ||
    command.type === "APPROVE" ||
    command.type === "DECLINE" ||
    command.type === "DONE"
  ) {
    await ports.handleMarketplaceCommand({ contactId: contact.id, rawText: text, command });
    return { outcome: "MARKETPLACE_COMMAND", commandType: command.type };
  }

  return { outcome: "NO_OP" };
}
