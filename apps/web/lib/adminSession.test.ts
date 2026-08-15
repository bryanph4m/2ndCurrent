import { describe, expect, it } from "vitest";
import { createAdminSessionToken, verifyAdminSessionToken } from "./adminSession";

describe("admin session tokens", () => {
  it("accepts a valid token and rejects tampering and expiry", async () => {
    const now = () => 1_700_000_000_000;
    const token = await createAdminSessionToken("a long private session secret", {
      now,
      ttlSeconds: 60,
    });
    expect(await verifyAdminSessionToken(token, "a long private session secret", now)).toBe(true);
    expect(await verifyAdminSessionToken(`${token}x`, "a long private session secret", now)).toBe(
      false,
    );
    expect(
      await verifyAdminSessionToken(token, "a long private session secret", () => now() + 61_000),
    ).toBe(false);
  });
});
