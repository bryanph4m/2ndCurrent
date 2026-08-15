import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const AES_KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Section 31.2: HMAC-SHA256 for the lookup hash (never plain SHA-256 - the
// phone number input space is too small to resist a rainbow-table attack
// without a secret key), AES-256-GCM for the reversible ciphertext. Keys are
// passed in rather than read from process.env so this stays pure and testable
// without environment wiring.
export function hashPhone(lookupKey: Buffer, normalizedPhone: string): string {
  return createHmac("sha256", lookupKey).update(normalizedPhone).digest("hex");
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== AES_KEY_LENGTH) {
    throw new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes, got ${key.length}`);
  }
}

export function encryptPhone(encryptionKey: Buffer, normalizedPhone: string): string {
  assertKeyLength(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(normalizedPhone, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptPhone(encryptionKey: Buffer, ciphertextBase64: string): string {
  assertKeyLength(encryptionKey);
  const raw = Buffer.from(ciphertextBase64, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
