const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))),
  );
}

export async function createAdminSessionToken(
  secret: string,
  options: { now?: () => number; ttlSeconds?: number } = {},
): Promise<string> {
  const expiresAt = Math.floor((options.now ?? Date.now)() / 1000) + (options.ttlSeconds ?? 28_800);
  const payload = `v1.${expiresAt}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now: () => number = Date.now,
): Promise<boolean> {
  if (!token) return false;
  const [version, expiresText, signature, extra] = token.split(".");
  if (version !== "v1" || !expiresText || !signature || extra) return false;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now() / 1000)) return false;
  const expected = await sign(`${version}.${expiresText}`, secret);
  if (signature.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < signature.length; index++) {
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
