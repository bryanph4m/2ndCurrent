import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryObjectStorage } from "./memory";

describe("MemoryObjectStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a stored object", async () => {
    const storage = new MemoryObjectStorage();
    const bytes = Buffer.from("fake-image-bytes");

    const stored = await storage.putPrivateObject({
      objectKey: "items/item_1/full.jpg",
      bytes,
      mimeType: "image/jpeg",
    });

    expect(stored.sizeBytes).toBe(bytes.byteLength);
    await expect(storage.getPrivateObject("items/item_1/full.jpg")).resolves.toEqual(bytes);
  });

  it("throws for a signed URL request on a missing key", async () => {
    const storage = new MemoryObjectStorage();
    await expect(storage.createSignedReadUrl("missing", 60)).rejects.toThrow();
  });

  it("resolves a signed URL within its TTL and rejects it once expired", async () => {
    const storage = new MemoryObjectStorage();
    const bytes = Buffer.from("fake-label-bytes");
    await storage.putPrivateObject({
      objectKey: "items/item_1/label.jpg",
      bytes,
      mimeType: "image/jpeg",
    });

    const url = await storage.createSignedReadUrl("items/item_1/label.jpg", 60);
    expect(storage.resolveSignedUrl(url)).toEqual(bytes);

    vi.advanceTimersByTime(61_000);
    expect(() => storage.resolveSignedUrl(url)).toThrow("expired");
  });

  it("removes a deleted object", async () => {
    const storage = new MemoryObjectStorage();
    await storage.putPrivateObject({
      objectKey: "items/item_1/full.jpg",
      bytes: Buffer.from("x"),
      mimeType: "image/jpeg",
    });

    await storage.deleteObject("items/item_1/full.jpg");
    await expect(storage.getPrivateObject("items/item_1/full.jpg")).rejects.toThrow();
  });
});
