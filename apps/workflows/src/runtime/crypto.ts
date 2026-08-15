import { createHash } from "node:crypto";
import { encryptPhone, hashPhone, type IntakeCrypto } from "@secondcurrent/domain";

// Mirrors apps/web/lib/crypto.ts's getIntakeCrypto - same env vars, same
// derivation, since both services process the same phone-carrying data.
let intakeCrypto: IntakeCrypto | undefined;

export function getIntakeCrypto(): IntakeCrypto {
  if (intakeCrypto) {
    return intakeCrypto;
  }

  const lookupKeyBase64 = process.env.PHONE_LOOKUP_KEY;
  const encryptionKeyBase64 = process.env.FIELD_ENCRYPTION_KEY;
  if (!lookupKeyBase64 || !encryptionKeyBase64) {
    throw new Error("PHONE_LOOKUP_KEY and FIELD_ENCRYPTION_KEY are required");
  }

  const lookupKey = Buffer.from(lookupKeyBase64, "base64");
  const encryptionKey = Buffer.from(encryptionKeyBase64, "base64");

  intakeCrypto = {
    hashPhone: (phone) => hashPhone(lookupKey, phone),
    encryptPhone: (phone) => encryptPhone(encryptionKey, phone),
    sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
  };
  return intakeCrypto;
}
