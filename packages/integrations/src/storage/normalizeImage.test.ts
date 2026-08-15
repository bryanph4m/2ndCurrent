import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, normalizePrivateImage } from "./normalizeImage";

describe("normalizePrivateImage", () => {
  it("re-encodes to webp, applies orientation, and omits source metadata", async () => {
    const source = await sharp({
      create: { width: 4, height: 3, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "private" } } })
      .toBuffer();

    const normalized = await normalizePrivateImage({
      bytes: source,
      mimeType: "image/jpeg",
      now: () => new Date("2026-08-15T12:00:00.000Z"),
    });
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.mimeType).toBe("image/webp");
    expect([normalized.width, normalized.height]).toEqual([3, 4]);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(normalized.metadataRemovedAt.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("rejects unsupported and oversized input before decoding", async () => {
    await expect(
      normalizePrivateImage({ bytes: Buffer.from("x"), mimeType: "image/gif" }),
    ).rejects.toThrow("Unsupported");
    await expect(
      normalizePrivateImage({
        bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1),
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow("Image size");
  });
});
