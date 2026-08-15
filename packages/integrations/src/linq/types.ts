export type VerifiedMessagingEvent = {
  eventId: string;
  type: string;
  chatId: string;
  fromPhone: string;
  text?: string | undefined;
  mediaUrls: string[];
  raw: unknown;
};

export type SendTextInput = {
  chatId: string;
  text: string;
  idempotencyKey: string;
};

export type ProviderMessageResult = {
  providerMessageId: string;
};

export type AttachmentReference = {
  url: string;
};

export type DownloadedAttachment = {
  bytes: Buffer;
  mimeType: string;
};

export interface MessagingProvider {
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedMessagingEvent>;
  sendText(input: SendTextInput): Promise<ProviderMessageResult>;
  downloadAttachment(input: AttachmentReference): Promise<DownloadedAttachment>;
}
