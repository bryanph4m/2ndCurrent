import {
  analyzeItem,
  assertItemTransition,
  type ImageObservation,
  type ItemState,
  type MediaLabel,
} from "@secondcurrent/domain";
import { db } from "./client";
import { Prisma } from "../generated/prisma/client";
import { transitionWithAudit } from "./audit";
import { loadPriceCatalog } from "./priceCatalog";
import { enqueueOutboxMessage } from "./repositories/outboxRepository";
import { writeFinalizedPassport, writeRejectedResult } from "./finalizeItemFlow";

type ImageRole = "full_item" | "connector" | "label" | "damage" | "other";

export type AnalyzeImage = (input: {
  objectKey: string;
  sha256: string;
  imageRole: ImageRole;
}) => Promise<ImageObservation>;

// AnalyzeImageInput.imageRole has no "power_on" value (section 18.1); a
// power-on proof photo is optional evidence, not a required view, so it maps
// to "other" for analysis purposes.
const IMAGE_ROLE_BY_LABEL: Record<MediaLabel, ImageRole> = {
  FULL_ITEM: "full_item",
  CONNECTOR: "connector",
  LABEL: "label",
  DAMAGE: "damage",
  POWER_ON: "other",
  OTHER: "other",
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/webp"]);

// Section 31.3's defense-in-depth validation. Intake has already re-encoded
// every upload and removed metadata before this paid analysis call.
function assertNormalizableImage(input: { mimeType: string; sizeBytes: number }): void {
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`Unsupported image type for analysis: ${input.mimeType}`);
  }
  if (input.sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES} byte analysis limit`);
  }
}

function buildEvidenceRequestText(missingLabels: string[]): string {
  const readable = missingLabels.map((label) => label.replace(/_/g, " ")).join(", ");
  return `We need one more photo before we can check this item: ${readable}.`;
}

// The provider contract returns a quote with draft creation, after this
// preliminary budget decision. This conservative estimate is rechecked
// against the real returned quote before launch in reviewStudyFlow.
const ESTIMATED_HUMAN_REVIEW_QUOTE_CENTS = 300;
const EXPECTED_CONFIDENCE_AFTER_REVIEW = 0.9;

export type AnalyzeItemFlowResult =
  | { outcome: "ALREADY_CLAIMED" }
  | { outcome: "REJECTED" }
  | { outcome: "WAITING_FOR_EVIDENCE" }
  | { outcome: "WAITING_FOR_REVIEW" }
  | { outcome: "FINALIZED"; passportSlug: string };

// The DB half of architecture doc section 17.2's analyzeItem: claim one
// AnalysisRun per (itemId, version) via the @@unique constraint so a retried
// task run is a no-op, run the pure domain pipeline, and persist exactly one
// of REJECTED / WAITING_FOR_EVIDENCE / WAITING_FOR_REVIEW / FINALIZED. The
// Render-specific task wrapper (timeout, retry policy, WorkflowRun records)
// is Phase 6; this still runs through the existing InlineTaskRunner.
export async function runItemAnalysis(
  itemId: string,
  analyzeImageFn: AnalyzeImage,
): Promise<AnalyzeItemFlowResult> {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  const media = await db.mediaAsset.findMany({ where: { itemId } });
  const version = (await db.analysisRun.count({ where: { itemId } })) + 1;

  let run;
  try {
    run = await db.analysisRun.create({
      data: {
        itemId,
        version,
        status: "RUNNING",
        modelProvider: "vision",
        modelName: "item-observation",
        promptVersion: "item-observation.v1",
        policyVersion: item.activePolicyVersion,
        inputHash: [...media.map((m) => m.sha256)].sort().join(","),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { outcome: "ALREADY_CLAIMED" };
    }
    throw error;
  }

  await transitionItemState(itemId, item.status as ItemState, "ANALYZING", "item.analyzing");

  try {
    const observations = await Promise.all(
      media.map((asset) => {
        assertNormalizableImage({ mimeType: asset.mimeType, sizeBytes: asset.sizeBytes });
        return analyzeImageFn({
          objectKey: asset.objectKey,
          sha256: asset.sha256,
          imageRole: IMAGE_ROLE_BY_LABEL[asset.label],
        });
      }),
    );

    const requestsSentSoFar = await db.evidenceRequest.count({ where: { itemId } });
    const paidOrder = await db.serviceOrder.findFirst({
      where: { itemId, status: { in: ["PAID", "FULFILLING", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
    });

    const result = analyzeItem({
      images: observations,
      itemCategoryHint: item.category,
      requestsSentSoFar,
      priceCatalog: loadPriceCatalog(),
      humanReview: {
        orderHumanBudgetCents: paidOrder?.humanBudgetCents ?? 0,
        quotedCostCents: ESTIMATED_HUMAN_REVIEW_QUOTE_CENTS,
        expectedConfidenceAfterReview: EXPECTED_CONFIDENCE_AFTER_REVIEW,
        riskPenaltyAvoidedCents: 0,
      },
    });

    if (result.outcome === "REJECTED") {
      await db.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "REJECTED",
          safetyStatus: "DO_NOT_LIST",
          identityConfidence: result.merged.identity.confidence,
          finishedAt: new Date(),
        },
      });
      await writeRejectedResult({ itemId, analysisRunId: run.id, fromState: "ANALYZING" });
      return { outcome: "REJECTED" };
    }

    if (result.outcome === "WAITING_FOR_EVIDENCE") {
      const requestNumber = result.evidence.requestNumber;
      const promptText = buildEvidenceRequestText(result.evidence.missingRequired);
      await db.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "WAITING_FOR_EVIDENCE",
          identityConfidence: result.merged.identity.confidence,
          finishedAt: new Date(),
        },
      });
      await db.$transaction(async (tx) => {
        await tx.evidenceRequest.create({
          data: {
            itemId,
            analysisRunId: run.id,
            requestedLabels: result.evidence.missingRequired,
            reasonCodes: ["MISSING_REQUIRED_VIEW"],
            promptText,
            status: "SENT",
            requestNumber,
          },
        });
        await transitionWithAudit({
          tx,
          entityType: "Item",
          entityId: itemId,
          itemId,
          actorType: "system",
          action: "item.waiting_for_evidence",
          from: "ANALYZING",
          to: "WAITING_FOR_EVIDENCE",
          assertFn: assertItemTransition,
          applyUpdate: () =>
            tx.item.update({ where: { id: itemId }, data: { status: "WAITING_FOR_EVIDENCE" } }),
        });
      });
      await enqueueOutboxMessage({
        contactId: item.ownerContactId,
        idempotencyKey: `evidence-request:${itemId}:${requestNumber}`,
        messageType: "text",
        payload: { text: promptText },
      });
      return { outcome: "WAITING_FOR_EVIDENCE" };
    }

    if (result.outcome === "WAITING_FOR_REVIEW") {
      // Phase 7 creates and launches the Terac study itself; this only
      // records the decision and parks the item.
      await db.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "WAITING_FOR_REVIEW",
          identityConfidence: result.merged.identity.confidence,
          reviewDecision: result.review as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      await db.$transaction(async (tx) => {
        await transitionWithAudit({
          tx,
          entityType: "Item",
          entityId: itemId,
          itemId,
          actorType: "system",
          action: "item.waiting_for_review",
          from: "ANALYZING",
          to: "WAITING_FOR_REVIEW",
          assertFn: assertItemTransition,
          applyUpdate: () =>
            tx.item.update({ where: { id: itemId }, data: { status: "WAITING_FOR_REVIEW" } }),
        });
      });
      return { outcome: "WAITING_FOR_REVIEW" };
    }

    const passportSlug = item.publicId;
    const passport = result.passport;
    const evidenceSummary = media.map((asset) => ({
      label: asset.label,
      capturedAt: asset.createdAt.toISOString(),
      reviewedByPeople: false,
    }));

    await db.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "FINALIZED",
        safetyStatus: passport.safetyStatus,
        identityConfidence: passport.identityConfidence,
        normalizedOutput: passport as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    await writeFinalizedPassport({
      itemId,
      analysisRunId: run.id,
      publicSlug: passportSlug,
      passport,
      evidenceSummary,
      fromState: "ANALYZING",
    });
    return { outcome: "FINALIZED", passportSlug };
  } catch (error) {
    await db.analysisRun
      .update({
        where: { id: run.id },
        data: { status: "ERROR", errorMessage: String(error), finishedAt: new Date() },
      })
      .catch(() => {});
    await transitionItemState(itemId, "ANALYZING", "ERROR", "item.analysis_failed").catch(() => {});
    throw error;
  }
}

async function transitionItemState(
  itemId: string,
  from: ItemState,
  to: ItemState,
  action: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: itemId,
      itemId,
      actorType: "system",
      action,
      from,
      to,
      assertFn: assertItemTransition,
      applyUpdate: () => tx.item.update({ where: { id: itemId }, data: { status: to } }),
    });
  });
}
