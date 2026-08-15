import type { MediaLabel } from "@secondcurrent/domain";
import { db } from "../client";
import { Prisma } from "../../generated/prisma/client";

export type AttachMediaInput = {
  itemId: string;
  messageId?: string | undefined;
  label: MediaLabel;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
  metadataRemovedAt: Date;
};

export type AttachMediaResult = { attached: boolean; totalCount: number };

// @@unique([itemId, sha256]) on MediaAsset makes a re-sent identical photo a
// no-op instead of a second row (section 12.2: "Duplicate images are
// ignored"). Same insert-then-catch pattern as webhookEventRepository, for
// the same reason.
export async function attachMedia(input: AttachMediaInput): Promise<AttachMediaResult> {
  try {
    await db.mediaAsset.create({
      data: {
        itemId: input.itemId,
        messageId: input.messageId ?? null,
        kind: "IMAGE",
        label: input.label,
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        width: input.width,
        height: input.height,
        metadataRemovedAt: input.metadataRemovedAt,
      },
    });
    const totalCount = await db.mediaAsset.count({ where: { itemId: input.itemId } });
    return { attached: true, totalCount };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const totalCount = await db.mediaAsset.count({ where: { itemId: input.itemId } });
      return { attached: false, totalCount };
    }
    throw error;
  }
}

export function countMediaForItem(itemId: string): Promise<number> {
  return db.mediaAsset.count({ where: { itemId } });
}

// Section 16.6: the study page renders these through short-lived signed
// reads, never the objectKey itself - selecting only what that page needs
// keeps a private object key from leaking into the page by accident.
export function findMediaForItem(itemId: string) {
  return db.mediaAsset.findMany({
    where: { itemId },
    select: { label: true, objectKey: true },
    orderBy: { createdAt: "asc" },
  });
}
