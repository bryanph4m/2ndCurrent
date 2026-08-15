import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import type {
  AttachmentReference,
  DownloadedAttachment,
  MessagingProvider,
  ProviderMessageResult,
  SendTextInput,
  VerifiedMessagingEvent,
} from "./types";

export class MockMessagingProvider implements MessagingProvider {
  readonly sent: SendTextInput[] = [];
  private readonly attachments = new Map<string, DownloadedAttachment>();
  private nextMessageId = 1;

  seedAttachment(url: string, attachment: DownloadedAttachment): void {
    this.attachments.set(url, attachment);
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedMessagingEvent> {
    if (headers.get(MOCK_SIGNATURE_HEADER) !== MOCK_SIGNATURE_VALID) {
      throw new WebhookVerificationError("linq", "missing or invalid signature header");
    }

    const raw = JSON.parse(rawBody) as {
      eventId: string;
      type: string;
      chatId: string;
      fromPhone: string;
      text?: string;
      mediaUrls?: string[];
    };

    return {
      eventId: raw.eventId,
      type: raw.type,
      chatId: raw.chatId,
      fromPhone: raw.fromPhone,
      text: raw.text,
      mediaUrls: raw.mediaUrls ?? [],
      raw,
    };
  }

  async sendText(input: SendTextInput): Promise<ProviderMessageResult> {
    this.sent.push(input);
    return { providerMessageId: `mock_msg_${this.nextMessageId++}` };
  }

  async downloadAttachment(input: AttachmentReference): Promise<DownloadedAttachment> {
    const attachment = this.attachments.get(input.url);
    if (!attachment) {
      throw new Error(`No mock attachment seeded for ${input.url}`);
    }
    return attachment;
  }
}
