import type { IntakePorts } from "@secondcurrent/domain";
import type { Prisma } from "../generated/prisma/client";
import { createItem } from "./repositories/itemRepository";
import { findOrCreateContact, recordOptOut } from "./repositories/contactRepository";
import {
  createConversation,
  getConversationForContact,
  transitionConversation,
} from "./repositories/conversationRepository";
import { recordInboundMessage } from "./repositories/messageRepository";
import { attachMedia, countMediaForItem } from "./repositories/mediaRepository";
import { enqueueOutboxMessage } from "./repositories/outboxRepository";
import { createRecoveryCheckOrder, type CreateCheckout } from "./paymentFlow";
import { handleMarketplaceCommand } from "./marketplaceFlow";

export type DownloadAttachment = (url: string) => Promise<{ bytes: Buffer; mimeType: string }>;
export type StorePrivateObject = (input: {
  objectKey: string;
  bytes: Buffer;
  mimeType: string;
}) => Promise<void>;
export type NormalizeAttachment = (input: { bytes: Buffer; mimeType: string }) => Promise<{
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  metadataRemovedAt: Date;
}>;

export type LinqIntakePortsDeps = {
  downloadAttachment: DownloadAttachment;
  storePrivateObject: StorePrivateObject;
  normalizeAttachment: NormalizeAttachment;
  createCheckout: CreateCheckout;
  appBaseUrl: string;
};

// The real, Prisma-backed implementation of the port interface
// packages/domain/src/services/linqIntake.ts depends on. Domain code never
// imports Prisma; this is the only place the two meet. Everything
// provider-shaped is injected rather than imported from
// @secondcurrent/integrations directly, so this package never depends on a
// provider SDK either.
export function createLinqIntakePorts(deps: LinqIntakePortsDeps): IntakePorts {
  return {
    async findOrCreateContact(input) {
      const contact = await findOrCreateContact(input);
      return { id: contact.id, status: contact.status };
    },

    async getConversation(contactId) {
      const conversation = await getConversationForContact(contactId);
      if (!conversation) {
        return null;
      }
      return {
        id: conversation.id,
        state: conversation.state,
        version: conversation.version,
        activeItemId: conversation.activeItemId,
      };
    },

    async createConversation(contactId) {
      const conversation = await createConversation(contactId);
      return {
        id: conversation.id,
        state: conversation.state,
        version: conversation.version,
        activeItemId: conversation.activeItemId,
      };
    },

    async transitionConversation(input) {
      await transitionConversation({
        conversationId: input.conversationId,
        expectedVersion: input.expectedVersion,
        to: input.to,
        activeItemId: input.activeItemId,
        actor: { type: "system" },
      });
    },

    async recordInboundMessage(input) {
      await recordInboundMessage({
        contactId: input.contactId,
        conversationId: input.conversationId,
        provider: "linq",
        text: input.text,
        rawPayload: input.raw as Prisma.InputJsonValue,
      });
    },

    async recordOptOut(contactId) {
      await recordOptOut(contactId);
    },

    async createItem(input) {
      const item = await createItem({
        ownerContactId: input.ownerContactId,
        activePolicyVersion: "intake.v1",
      });
      return { id: item.id };
    },

    async attachMedia(input) {
      return attachMedia(input);
    },

    countMedia: countMediaForItem,

    async enqueueOutbound(input) {
      await enqueueOutboxMessage({
        contactId: input.contactId,
        idempotencyKey: input.idempotencyKey,
        messageType: "text",
        payload: { text: input.text },
      });
    },

    async createRecoveryCheckOrder(input) {
      const result = await createRecoveryCheckOrder(
        {
          contactId: input.contactId,
          itemId: input.itemId,
          appBaseUrl: deps.appBaseUrl,
        },
        deps.createCheckout,
      );
      return { checkoutUrl: result.checkoutUrl };
    },

    async handleMarketplaceCommand(input) {
      await handleMarketplaceCommand(input);
    },

    downloadAttachment: deps.downloadAttachment,
    normalizeAttachment: deps.normalizeAttachment,
    storePrivateObject: deps.storePrivateObject,
  };
}
