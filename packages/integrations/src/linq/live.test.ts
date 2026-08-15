import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { WebhookVerificationError } from "../errors";
import { LinqMessagingProvider } from "./live";

const WEBHOOK_SECRET = `whsec_${Buffer.from("test-secret-32-bytes-long-enough").toString("base64")}`;

function signedHeaders(secret: string, body: string): Headers {
  const wh = new Webhook(secret);
  const id = "msg_test_1";
  const timestamp = new Date();
  const signature = wh.sign(id, timestamp, body);
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  });
}

const messageReceivedBody = JSON.stringify({
  event_id: "evt_1",
  event_type: "message.received",
  api_version: "v3",
  created_at: new Date().toISOString(),
  partner_id: "partner_1",
  trace_id: "trace_1",
  webhook_version: "2026-02-03",
  data: {
    id: "msg_1",
    direction: "inbound",
    chat: {
      id: "chat_1",
      health_status: {
        status: "HEALTHY",
        doc_url: "https://example.com",
        updated_at: new Date().toISOString(),
      },
    },
    sender_handle: {
      id: "handle_1",
      handle: "+15551234567",
      joined_at: new Date().toISOString(),
      service: "iMessage",
    },
    service: "iMessage",
    parts: [
      { type: "text", value: "SELL" },
      {
        type: "media",
        id: "att_1",
        filename: "a.jpg",
        mime_type: "image/jpeg",
        size_bytes: 100,
        url: "https://example.com/a.jpg",
      },
    ],
  },
});

// This test runs the SDK's real Standard Webhooks HMAC verification (its
// only dependency) end to end with no network access: signing and verifying
// are both pure crypto over the raw body. sendText/downloadAttachment are
// real HTTP calls to the Linq API and are exercised only by the live smoke
// tests (section 34.4), not here.
describe("LinqMessagingProvider", () => {
  it("verifies a real Standard Webhooks signature and maps a message.received event", async () => {
    const provider = new LinqMessagingProvider({ apiKey: "test", webhookSecret: WEBHOOK_SECRET });

    const event = await provider.verifyWebhook(
      messageReceivedBody,
      signedHeaders(WEBHOOK_SECRET, messageReceivedBody),
    );

    expect(event).toMatchObject({
      eventId: "evt_1",
      type: "message.received",
      chatId: "chat_1",
      fromPhone: "+15551234567",
      text: "SELL",
      mediaUrls: ["https://example.com/a.jpg"],
    });
  });

  it("rejects a webhook with an invalid signature", async () => {
    const provider = new LinqMessagingProvider({ apiKey: "test", webhookSecret: WEBHOOK_SECRET });

    await expect(
      provider.verifyWebhook(
        messageReceivedBody,
        new Headers({
          "webhook-id": "msg_test_1",
          "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
          "webhook-signature": "v1,not-a-real-signature",
        }),
      ),
    ).rejects.toThrow(WebhookVerificationError);
  });

  it("rejects a webhook signed with the wrong secret", async () => {
    const provider = new LinqMessagingProvider({ apiKey: "test", webhookSecret: WEBHOOK_SECRET });
    const wrongSecret = `whsec_${Buffer.from("a-completely-different-secret-32b").toString("base64")}`;

    await expect(
      provider.verifyWebhook(messageReceivedBody, signedHeaders(wrongSecret, messageReceivedBody)),
    ).rejects.toThrow(WebhookVerificationError);
  });
});
