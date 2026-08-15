import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPhone, encryptPhone, hashPhone } from "./phone";

const KEY_A = randomBytes(32);
const KEY_B = randomBytes(32);
const PHONE = "+15551234567";

describe("hashPhone", () => {
  it("is deterministic for the same key and phone", () => {
    expect(hashPhone(KEY_A, PHONE)).toBe(hashPhone(KEY_A, PHONE));
  });

  it("differs across keys for the same phone", () => {
    expect(hashPhone(KEY_A, PHONE)).not.toBe(hashPhone(KEY_B, PHONE));
  });

  it("differs across phones for the same key", () => {
    expect(hashPhone(KEY_A, PHONE)).not.toBe(hashPhone(KEY_A, "+15559876543"));
  });
});

describe("encryptPhone / decryptPhone", () => {
  it("round-trips the phone number", () => {
    const ciphertext = encryptPhone(KEY_A, PHONE);
    expect(decryptPhone(KEY_A, ciphertext)).toBe(PHONE);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptPhone(KEY_A, PHONE)).not.toBe(encryptPhone(KEY_A, PHONE));
  });

  it("fails to decrypt with the wrong key", () => {
    const ciphertext = encryptPhone(KEY_A, PHONE);
    expect(() => decryptPhone(KEY_B, ciphertext)).toThrow();
  });

  it("detects tampering via the GCM auth tag", () => {
    const ciphertext = encryptPhone(KEY_A, PHONE);
    const raw = Buffer.from(ciphertext, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1]! + 1) % 256;
    expect(() => decryptPhone(KEY_A, raw.toString("base64"))).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encryptPhone(randomBytes(16), PHONE)).toThrow("32 bytes");
  });
});
