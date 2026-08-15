import { describe, expect, it } from "vitest";
import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import { MockMessagingProvider } from "./mock";

const fixtureBody = JSON.stringify({
  eventId: "evt_linq_1",
  type: "message.received",
  chatId: "chat_1",
  fromPhone: "+15551234567",
  text: "SELL",
  mediaUrls: [],
});

describe("MockMessagingProvider", () => {
  it("rejects a webhook without a valid signature header", async () => {
    const provider = new MockMessagingProvider();
    await expect(provider.verifyWebhook(fixtureBody, new Headers())).rejects.toThrow(
      WebhookVerificationError,
    );
  });

  it("verifies a signed webhook and parses the event", async () => {
    const provider = new MockMessagingProvider();
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_VALID });

    const event = await provider.verifyWebhook(fixtureBody, headers);

    expect(event).toMatchObject({
      eventId: "evt_linq_1",
      type: "message.received",
      chatId: "chat_1",
      text: "SELL",
    });
  });

  it("records sent messages", async () => {
    const provider = new MockMessagingProvider();
    const result = await provider.sendText({
      chatId: "chat_1",
      text: "Send three photos.",
      idempotencyKey: "consent:chat_1:1",
    });

    expect(result.providerMessageId).toMatch(/^mock_msg_/);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ text: "Send three photos." });
  });

  it("throws when downloading an unseeded attachment", async () => {
    const provider = new MockMessagingProvider();
    await expect(
      provider.downloadAttachment({ url: "https://example.com/a.jpg" }),
    ).rejects.toThrow();
  });

  it("returns a seeded attachment", async () => {
    const provider = new MockMessagingProvider();
    provider.seedAttachment("https://example.com/a.jpg", {
      bytes: Buffer.from("fake-image-bytes"),
      mimeType: "image/jpeg",
    });

    const attachment = await provider.downloadAttachment({ url: "https://example.com/a.jpg" });
    expect(attachment.mimeType).toBe("image/jpeg");
  });
});
