import sharp from "sharp";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/webp"]);

export type NormalizedImage = {
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
  metadataRemovedAt: Date;
};

export async function normalizePrivateImage(input: {
  bytes: Buffer;
  mimeType: string;
  now?: () => Date;
}): Promise<NormalizedImage> {
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`Unsupported image type: ${input.mimeType}`);
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image size must be from 1 to ${MAX_IMAGE_BYTES} bytes`);
  }

  const result = await sharp(input.bytes, {
    failOn: "warning",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  if (!result.info.width || !result.info.height) {
    throw new Error("Normalized image is missing dimensions");
  }
  return {
    bytes: result.data,
    mimeType: "image/webp",
    width: result.info.width,
    height: result.info.height,
    metadataRemovedAt: (input.now ?? (() => new Date()))(),
  };
}
