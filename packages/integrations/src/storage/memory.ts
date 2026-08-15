import type { ObjectStorage, PutObjectInput, StoredObject } from "./types";

type StoredEntry = {
  bytes: Buffer;
  mimeType: string;
};

// A memory:// URL with the expiry baked in, so a signed read URL's TTL is
// actually testable without a real HTTP layer: resolveSignedUrl() is the
// stand-in for "someone GETs the signed URL" and enforces the expiry that
// createSignedReadUrl() promised.
export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, StoredEntry>();

  async putPrivateObject(input: PutObjectInput): Promise<StoredObject> {
    this.objects.set(input.objectKey, { bytes: input.bytes, mimeType: input.mimeType });
    return { objectKey: input.objectKey, sizeBytes: input.bytes.byteLength };
  }

  async getPrivateObject(objectKey: string): Promise<Buffer> {
    const entry = this.objects.get(objectKey);
    if (!entry) {
      throw new Error(`No object stored for key ${objectKey}`);
    }
    return entry.bytes;
  }

  async createSignedReadUrl(objectKey: string, ttlSeconds: number): Promise<string> {
    if (!this.objects.has(objectKey)) {
      throw new Error(`No object stored for key ${objectKey}`);
    }
    const expires = Date.now() + ttlSeconds * 1000;
    return `memory://${objectKey}?expires=${expires}`;
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }

  // Not part of the ObjectStorage interface: lets tests exercise what a
  // signed URL's TTL actually enforces, standing in for the real read path.
  // This is our own fixed format (we own both ends), so a plain split is
  // simpler and safer than routing it through WHATWG URL host parsing.
  resolveSignedUrl(url: string): Buffer {
    const match = /^memory:\/\/(.+)\?expires=(\d+)$/.exec(url);
    if (!match) {
      throw new Error(`Not a valid mock signed URL: ${url}`);
    }
    const [, objectKey, expiresText] = match;
    const expires = Number(expiresText);

    if (Date.now() > expires) {
      throw new Error("Signed URL has expired");
    }

    const entry = this.objects.get(objectKey as string);
    if (!entry) {
      throw new Error(`No object stored for key ${objectKey}`);
    }
    return entry.bytes;
  }
}
