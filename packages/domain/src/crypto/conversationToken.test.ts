import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { signConversationToken, verifyConversationToken } from "./conversationToken";

const SECRET_A = randomBytes(32);
const SECRET_B = randomBytes(32);
const PAYLOAD = { itemId: "item_1", contactId: "contact_1" };

describe("conversation token", () => {
  it("round-trips the payload", () => {
    const token = signConversationToken(SECRET_A, PAYLOAD, 900);
    expect(verifyConversationToken(SECRET_A, token)).toEqual(PAYLOAD);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signConversationToken(SECRET_A, PAYLOAD, 900);
    expect(() => verifyConversationToken(SECRET_B, token)).toThrow(
      "Invalid conversation token signature",
    );
  });

  it("rejects a tampered payload", () => {
    const token = signConversationToken(SECRET_A, PAYLOAD, 900);
    const [bodyBase64, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ itemId: "item_2", contactId: "contact_1", exp: 9_999_999_999 }),
    ).toString("base64url");
    expect(() => verifyConversationToken(SECRET_A, `${tamperedBody}.${signature}`)).toThrow(
      "Invalid conversation token signature",
    );
    expect(bodyBase64).toBeDefined();
  });

  it("rejects a malformed token", () => {
    expect(() => verifyConversationToken(SECRET_A, "not-a-real-token")).toThrow(
      "Malformed conversation token",
    );
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    const token = signConversationToken(SECRET_A, PAYLOAD, 60);
    vi.advanceTimersByTime(61_000);
    expect(() => verifyConversationToken(SECRET_A, token)).toThrow("expired");
    vi.useRealTimers();
  });
});
