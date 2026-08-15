import LinqAPIV3 from "@linqapp/sdk";
import type { MessageContent } from "@linqapp/sdk/resources/chats/chats.js";
import type {
  MessageEventV2,
  SchemasMediaPartResponse,
  SchemasTextPartResponse,
  UnwrapWebhookEvent,
} from "@linqapp/sdk/resources/webhooks.js";
import { WebhookVerificationError } from "../errors";
import type {
  AttachmentReference,
  DownloadedAttachment,
  MessagingProvider,
  ProviderMessageResult,
  SendTextInput,
  VerifiedMessagingEvent,
} from "./types";

function isMessageEvent(
  event: UnwrapWebhookEvent,
): event is UnwrapWebhookEvent & { data: MessageEventV2 } {
  return event.event_type.startsWith("message.") && "chat" in event.data;
}

// @linqapp/sdk's webhooks.unwrap() runs Standard Webhooks HMAC verification
// (its only dependency, "standardwebhooks") synchronously and throws on a bad
// signature; this adapter wraps that in our own WebhookVerificationError so
// callers only ever handle one error type across mock and live providers.
export class LinqMessagingProvider implements MessagingProvider {
  private readonly client: LinqAPIV3;

  constructor(input: { apiKey: string; webhookSecret: string }) {
    this.client = new LinqAPIV3({
      apiKey: input.apiKey,
      webhookSecret: input.webhookSecret,
    });
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedMessagingEvent> {
    let event: UnwrapWebhookEvent;
    try {
      event = this.client.webhooks.unwrap(rawBody, {
        headers: Object.fromEntries(headers.entries()),
      });
    } catch (error) {
      throw new WebhookVerificationError(
        "linq",
        error instanceof Error ? error.message : "invalid signature",
      );
    }

    if (!isMessageEvent(event)) {
      return {
        eventId: event.event_id,
        type: event.event_type,
        chatId: "",
        fromPhone: "",
        mediaUrls: [],
        raw: event,
      };
    }

    const textParts = event.data.parts.filter(
      (part): part is SchemasTextPartResponse => part.type === "text",
    );
    const mediaParts = event.data.parts.filter(
      (part): part is SchemasMediaPartResponse => part.type === "media",
    );
    const text = textParts.map((part) => part.value).join(" ");

    return {
      eventId: event.event_id,
      type: event.event_type,
      chatId: event.data.chat.id,
      fromPhone: event.data.sender_handle.handle,
      text: text.length > 0 ? text : undefined,
      mediaUrls: mediaParts.map((part) => part.url),
      raw: event,
    };
  }

  async sendText(input: SendTextInput): Promise<ProviderMessageResult> {
    const message: MessageContent = {
      parts: [{ type: "text", value: input.text }],
      idempotency_key: input.idempotencyKey,
    };
    const result = await this.client.chats.messages.send(input.chatId, { message });
    return { providerMessageId: result.message.id };
  }

  async downloadAttachment(input: AttachmentReference): Promise<DownloadedAttachment> {
    const response = await fetch(input.url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
    return { bytes, mimeType };
  }
}
