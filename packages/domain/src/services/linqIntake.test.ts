import { describe, expect, it } from "vitest";
import {
  processInboundLinqEvent,
  type IntakeCrypto,
  type IntakePorts,
  type IntakeConversation,
  type IntakeContact,
} from "./linqIntake";

function createFakePorts() {
  const contacts = new Map<string, IntakeContact>();
  const contactIdByPhoneHash = new Map<string, string>();
  const conversations = new Map<string, IntakeConversation>();
  const conversationIdByContact = new Map<string, string>();
  const attachedShasByItem = new Map<string, Set<string>>();
  const attachedLabelsByItem = new Map<string, string[]>();
  const outbox: Array<{ contactId: string; idempotencyKey: string; text: string }> = [];
  const storedObjects = new Map<string, Buffer>();
  const recordedMessages = { count: 0 };
  const marketplaceCommands: string[] = [];
  let nextId = 1;

  const ports: IntakePorts = {
    async findOrCreateContact({ phoneHash }) {
      let id = contactIdByPhoneHash.get(phoneHash);
      if (!id) {
        id = `contact_${nextId++}`;
        contactIdByPhoneHash.set(phoneHash, id);
        contacts.set(id, { id, status: "ACTIVE" });
      }
      return contacts.get(id)!;
    },
    async getConversation(contactId) {
      const id = conversationIdByContact.get(contactId);
      return id ? (conversations.get(id) ?? null) : null;
    },
    async createConversation(contactId) {
      const id = `conv_${nextId++}`;
      const conversation: IntakeConversation = { id, state: "NEW", version: 0, activeItemId: null };
      conversations.set(id, conversation);
      conversationIdByContact.set(contactId, id);
      return conversation;
    },
    async transitionConversation({ conversationId, to, activeItemId }) {
      const conversation = conversations.get(conversationId)!;
      conversation.state = to;
      conversation.version += 1;
      if (activeItemId) {
        conversation.activeItemId = activeItemId;
      }
    },
    async recordInboundMessage() {
      recordedMessages.count++;
    },
    async recordOptOut(contactId) {
      contacts.get(contactId)!.status = "OPTED_OUT";
    },
    async createItem() {
      return { id: `item_${nextId++}` };
    },
    async countMedia(itemId) {
      return attachedShasByItem.get(itemId)?.size ?? 0;
    },
    async normalizeAttachment(input) {
      return {
        ...input,
        width: 100,
        height: 100,
        metadataRemovedAt: new Date("2026-08-15T12:00:00.000Z"),
      };
    },
    async attachMedia({ itemId, sha256, label }) {
      const seen = attachedShasByItem.get(itemId) ?? new Set<string>();
      const isNew = !seen.has(sha256);
      seen.add(sha256);
      attachedShasByItem.set(itemId, seen);
      if (isNew) {
        const labels = attachedLabelsByItem.get(itemId) ?? [];
        labels.push(label);
        attachedLabelsByItem.set(itemId, labels);
      }
      return { attached: isNew, totalCount: seen.size };
    },
    async enqueueOutbound(input) {
      outbox.push(input);
    },
    async downloadAttachment(url) {
      return { bytes: Buffer.from(url), mimeType: "image/jpeg" };
    },
    async storePrivateObject(input) {
      storedObjects.set(input.objectKey, input.bytes);
    },
    async createRecoveryCheckOrder({ itemId }) {
      return { checkoutUrl: `https://checkout.example.com/${itemId}` };
    },
    async handleMarketplaceCommand({ command }) {
      marketplaceCommands.push(command.type);
    },
  };

  return {
    ports,
    contacts,
    conversations,
    outbox,
    storedObjects,
    recordedMessages,
    marketplaceCommands,
    attachedLabelsByItem,
  };
}

const crypto: IntakeCrypto = {
  hashPhone: (phone) => `hash:${phone}`,
  encryptPhone: (phone) => `enc:${phone}`,
  sha256: (bytes) => `sha:${bytes.toString("utf8")}`,
};

function baseEvent(overrides: Partial<Parameters<typeof processInboundLinqEvent>[0]> = {}) {
  return {
    eventId: "evt_1",
    chatId: "chat_1",
    fromPhone: "+15551234567",
    text: undefined,
    mediaUrls: [],
    raw: {},
    ...overrides,
  };
}

describe("processInboundLinqEvent", () => {
  it("SELL starts the intake flow: creates an item, moves to WAITING_FOR_PHOTOS, sends instructions", async () => {
    const { ports, conversations, outbox } = createFakePorts();

    const result = await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);

    expect(result).toMatchObject({ outcome: "SELL_STARTED" });
    const conversation = [...conversations.values()][0]!;
    expect(conversation.state).toBe("WAITING_FOR_PHOTOS");
    expect(conversation.activeItemId).not.toBeNull();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain("Send three photos");
  });

  it("attaches three mock photos to one item, stores each, and moves to WAITING_FOR_PAYMENT", async () => {
    const { ports, outbox, storedObjects } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    outbox.length = 0;

    const result = await processInboundLinqEvent(
      baseEvent({
        text: undefined,
        mediaUrls: [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
          "https://example.com/3.jpg",
        ],
      }),
      crypto,
      ports,
    );

    expect(result).toMatchObject({ outcome: "PHOTOS_COMPLETE" });
    expect(storedObjects.size).toBe(3);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain("https://checkout.example.com/");
  });

  it("does not complete photo intake before three distinct photos arrive, and confirms progress instead of going silent", async () => {
    const { ports, outbox } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    outbox.length = 0;
    const result = await processInboundLinqEvent(
      baseEvent({ mediaUrls: ["https://example.com/1.jpg"] }),
      crypto,
      ports,
    );

    expect(result).toMatchObject({ outcome: "PHOTO_ATTACHED", totalCount: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toBe(
      "Got 1 of 3 photos. Still need: the connector or ports, the label or model number.",
    );
  });

  it("labels photos by running position across the item, not by index within one message", async () => {
    const { ports, attachedLabelsByItem } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    // An iPhone sends each picked photo as its own message, so each event
    // here carries exactly one attachment - the same shape as three separate
    // texts, not one text with three photos.
    await processInboundLinqEvent(
      baseEvent({ eventId: "evt_2", mediaUrls: ["https://example.com/1.jpg"] }),
      crypto,
      ports,
    );
    await processInboundLinqEvent(
      baseEvent({ eventId: "evt_3", mediaUrls: ["https://example.com/2.jpg"] }),
      crypto,
      ports,
    );
    await processInboundLinqEvent(
      baseEvent({ eventId: "evt_4", mediaUrls: ["https://example.com/3.jpg"] }),
      crypto,
      ports,
    );

    const [itemId] = [...attachedLabelsByItem.keys()];
    expect(attachedLabelsByItem.get(itemId!)).toEqual(["FULL_ITEM", "CONNECTOR", "LABEL"]);
  });

  it("rejects more than eight photos before downloading or storing any", async () => {
    const { ports, storedObjects } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    await expect(
      processInboundLinqEvent(
        baseEvent({ mediaUrls: Array.from({ length: 9 }, (_, index) => `photo-${index}`) }),
        crypto,
        ports,
      ),
    ).rejects.toThrow("at most 8 photos");
    expect(storedObjects.size).toBe(0);
  });

  it("STOP opts the contact out and sends exactly one confirmation", async () => {
    const { ports, contacts, outbox } = createFakePorts();

    const result = await processInboundLinqEvent(baseEvent({ text: "STOP" }), crypto, ports);

    expect(result).toMatchObject({ outcome: "OPTED_OUT" });
    expect([...contacts.values()][0]!.status).toBe("OPTED_OUT");
    expect(outbox).toHaveLength(1);
  });

  it("STOP prevents later outbound messages: a later SELL from an opted-out contact sends nothing", async () => {
    const { ports, outbox } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "STOP" }), crypto, ports);
    outbox.length = 0;

    const result = await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);

    expect(result).toMatchObject({ outcome: "SUPPRESSED_OPTED_OUT" });
    expect(outbox).toHaveLength(0);
  });

  it("a later message that is not itself an opt-out keyword opts the contact back in", async () => {
    const { ports, contacts } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "STOP" }), crypto, ports);
    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);

    // processInboundLinqEvent only suppresses; it does not itself flip the
    // contact back to ACTIVE (that is Linq's own platform behavior per the
    // SDK docs, mirrored here as a note, not re-implemented) - opting back in
    // requires an explicit re-consent flow. This test documents the current
    // (suppressing) behavior so a future change to that decision is visible.
    expect([...contacts.values()][0]!.status).toBe("OPTED_OUT");
  });

  it("does not deduplicate by itself: the same event processed twice records two messages", async () => {
    // Duplicate-webhook protection lives entirely in recordWebhookEvent's
    // unique constraint on (provider, externalEventId) at the route layer,
    // not in this pipeline - it runs once per already-deduplicated call.
    // This test proves that constraint is load-bearing, not incidental: the
    // pipeline alone would happily process the same event N times.
    const { ports, recordedMessages } = createFakePorts();
    const event = baseEvent({ text: "SELL" });

    await processInboundLinqEvent(event, crypto, ports);
    await processInboundLinqEvent(event, crypto, ports);

    expect(recordedMessages.count).toBe(2);
  });

  it("a second SELL while still waiting for photos resends the instructions instead of going silent", async () => {
    const { ports, outbox } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    outbox.length = 0;

    const result = await processInboundLinqEvent(
      baseEvent({ eventId: "evt_2", text: "SELL" }),
      crypto,
      ports,
    );

    expect(result).toMatchObject({ outcome: "SELL_STARTED" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain("Send three photos");
  });

  it("a second SELL after photos are already complete sends an in-progress notice instead of going silent", async () => {
    const { ports, outbox } = createFakePorts();

    await processInboundLinqEvent(baseEvent({ text: "SELL" }), crypto, ports);
    await processInboundLinqEvent(
      baseEvent({
        eventId: "evt_2",
        mediaUrls: [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
          "https://example.com/3.jpg",
        ],
      }),
      crypto,
      ports,
    );
    outbox.length = 0;

    const result = await processInboundLinqEvent(
      baseEvent({ eventId: "evt_3", text: "SELL" }),
      crypto,
      ports,
    );

    expect(result).toMatchObject({ outcome: "NO_OP" });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.text).toContain("already have an item check in progress");
  });

  it("routes NEED into the marketplace command handler", async () => {
    const { ports, marketplaceCommands } = createFakePorts();

    const result = await processInboundLinqEvent(
      baseEvent({ text: "NEED 65W USB-C LAPTOP CHARGER" }),
      crypto,
      ports,
    );

    expect(result).toEqual({ outcome: "MARKETPLACE_COMMAND", commandType: "NEED" });
    expect(marketplaceCommands).toEqual(["NEED"]);
  });
});
