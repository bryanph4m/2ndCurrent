import { createHmac, timingSafeEqual } from "node:crypto";

export type ConversationTokenPayload = {
  itemId: string;
  contactId: string;
};

// A minimal hand-rolled signed token (HMAC-SHA256 over a base64url JSON
// body), not a JWT library: one algorithm, one shape, nothing to
// misconfigure. Authenticates POST /api/checkout/recovery-check per section
// 16.2 without a session or account system. Keys are passed in, same
// convention as crypto/phone.ts.
export function signConversationToken(
  secret: Buffer,
  payload: ConversationTokenPayload,
  ttlSeconds: number,
): string {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const bodyBase64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac("sha256", secret).update(bodyBase64).digest("base64url");
  return `${bodyBase64}.${signature}`;
}

export function verifyConversationToken(secret: Buffer, token: string): ConversationTokenPayload {
  const [bodyBase64, signature] = token.split(".");
  if (!bodyBase64 || !signature) {
    throw new Error("Malformed conversation token");
  }

  const expectedSignature = createHmac("sha256", secret).update(bodyBase64).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid conversation token signature");
  }

  const body = JSON.parse(
    Buffer.from(bodyBase64, "base64url").toString("utf8"),
  ) as ConversationTokenPayload & { exp: number };
  if (body.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Conversation token has expired");
  }

  return { itemId: body.itemId, contactId: body.contactId };
}
