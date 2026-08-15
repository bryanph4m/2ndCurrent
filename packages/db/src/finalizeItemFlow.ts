import {
  applyReviewOutcome,
  assertItemTransition,
  StudyResponseAnswersSchema,
  type ItemClass,
  type ItemState,
  type PassportFields,
} from "@secondcurrent/domain";
import { Prisma } from "../generated/prisma/client";
import { db } from "./client";
import { transitionWithAudit } from "./audit";
import { loadPriceCatalog } from "./priceCatalog";
import { offerListingForPublishedItem } from "./marketplaceFlow";
import { findApprovedResponses } from "./repositories/reviewResponseRepository";
import { findActiveStudyForItem, transitionStudy } from "./repositories/reviewStudyRepository";

type EvidenceSummaryEntry = { label: string; capturedAt: string; reviewedByPeople: boolean };

function reviewChangedOutcome(draft: PassportFields, revised: PassportFields): boolean {
  return (
    draft.identityConfidence !== revised.identityConfidence ||
    draft.safetyStatus !== revised.safetyStatus ||
    draft.recommendedRoute !== revised.recommendedRoute ||
    draft.suggestedPriceCents !== revised.suggestedPriceCents ||
    draft.connector !== revised.connector ||
    draft.conditionGrade !== revised.conditionGrade
  );
}

function completedStudyData(
  configuration: unknown,
  correctedItem: boolean,
): Prisma.ReviewStudyUpdateInput {
  const current =
    configuration && typeof configuration === "object" && !Array.isArray(configuration)
      ? configuration
      : {};
  return {
    completedAt: new Date(),
    configuration: {
      ...current,
      outcomeMetrics: { correctedItem },
    } as Prisma.InputJsonValue,
  };
}

// Transitions the item off ANALYZING into REJECTED. Shared between
// analyzeItemFlow.ts's synchronous hard-safety-block path and finalizeItem's
// task-boundary reload below - the AnalysisRun row itself is written by the
// caller, since the two callers have that data in different shapes (fresh
// in memory vs reloaded from storage).
export async function writeRejectedResult(input: {
  itemId: string;
  analysisRunId: string;
  fromState: ItemState;
}): Promise<void> {
  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: input.itemId,
      itemId: input.itemId,
      actorType: "system",
      action: "item.rejected",
      from: input.fromState,
      to: "REJECTED",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({
          where: { id: input.itemId },
          data: { status: "REJECTED", currentAnalysisId: input.analysisRunId },
        }),
    });
  });
}

// Writes the RecoveryPassport row and transitions the item
// fromState -> FINALIZING -> READY. Shared between analyzeItemFlow.ts's
// synchronous finalize path and finalizeItem's task-boundary reload below.
export async function writeFinalizedPassport(input: {
  itemId: string;
  analysisRunId: string;
  publicSlug: string;
  passport: PassportFields;
  evidenceSummary: EvidenceSummaryEntry[];
  fromState: ItemState;
}): Promise<{ passportSlug: string }> {
  await db.$transaction(async (tx) => {
    await tx.recoveryPassport.upsert({
      where: { itemId: input.itemId },
      create: {
        itemId: input.itemId,
        publicSlug: input.publicSlug,
        title: input.passport.title,
        brand: input.passport.brand,
        modelName: input.passport.model,
        category: input.passport.category,
        connector: input.passport.connector,
        powerText: input.passport.powerText,
        conditionGrade: input.passport.conditionGrade,
        identityConfidence: input.passport.identityConfidence,
        safetyStatus: input.passport.safetyStatus,
        dataRisk: input.passport.dataRisk,
        recommendedRoute: input.passport.recommendedRoute,
        suggestedPriceCents: input.passport.suggestedPriceCents,
        knownFacts: input.passport.knownFacts,
        unknownFacts: input.passport.unknownFacts,
        evidenceSummary: input.evidenceSummary,
        disclaimer: input.passport.disclaimer,
        publishedAt: new Date(),
      },
      update: {
        title: input.passport.title,
        brand: input.passport.brand,
        modelName: input.passport.model,
        category: input.passport.category,
        connector: input.passport.connector,
        powerText: input.passport.powerText,
        conditionGrade: input.passport.conditionGrade,
        identityConfidence: input.passport.identityConfidence,
        safetyStatus: input.passport.safetyStatus,
        dataRisk: input.passport.dataRisk,
        recommendedRoute: input.passport.recommendedRoute,
        suggestedPriceCents: input.passport.suggestedPriceCents,
        knownFacts: input.passport.knownFacts,
        unknownFacts: input.passport.unknownFacts,
        evidenceSummary: input.evidenceSummary,
        disclaimer: input.passport.disclaimer,
        publishedAt: new Date(),
      },
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: input.itemId,
      itemId: input.itemId,
      actorType: "system",
      action: "item.finalizing",
      from: input.fromState,
      to: "FINALIZING",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: input.itemId }, data: { status: "FINALIZING" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: input.itemId,
      itemId: input.itemId,
      actorType: "system",
      action: "item.ready",
      from: "FINALIZING",
      to: "READY",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({
          where: { id: input.itemId },
          data: {
            status: "READY",
            finalRoute: input.passport.recommendedRoute,
            currentAnalysisId: input.analysisRunId,
          },
        }),
    });
  });
  await offerListingForPublishedItem(input.itemId);
  return { passportSlug: input.publicSlug };
}

export type FinalizeItemResult =
  { outcome: "PUBLISHED"; passportSlug: string } | { outcome: "REJECTED" } | { outcome: "NO_OP" };

// The task-boundary entry point matching section 17.1's finalize-item task
// signature ({itemId} only, JSON-safe): reloads the item's latest
// AnalysisRun from storage rather than taking it as an argument, since a
// real out-of-process Render task cannot receive live JS objects. This is
// what the finalize-item task (apps/workflows/src/tasks/finalize-item.ts)
// calls, and what Phase 7's Terac-approved review path will call once a
// human review can also lead to a finalized item.
//
// Idempotent: a repeat call after the item already reached READY or
// REJECTED is a no-op, matching "duplicate starts return the existing run"
// (section 41 Phase 6 acceptance).
export async function finalizeItem(itemId: string): Promise<FinalizeItemResult> {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  if (item.status === "READY" || item.status === "REJECTED") {
    if (item.status === "READY") {
      await offerListingForPublishedItem(itemId);
    }
    return { outcome: "NO_OP" };
  }

  const run = await db.analysisRun.findFirst({ where: { itemId }, orderBy: { version: "desc" } });
  if (!run) {
    throw new Error(`No AnalysisRun to finalize for item ${itemId}`);
  }

  if (run.status === "REJECTED") {
    await writeRejectedResult({
      itemId,
      analysisRunId: run.id,
      fromState: item.status as ItemState,
    });
    return { outcome: "REJECTED" };
  }

  if (run.status === "FINALIZED" && run.normalizedOutput) {
    const passport = run.normalizedOutput as unknown as PassportFields;
    const media = await db.mediaAsset.findMany({ where: { itemId } });
    const evidenceSummary = media.map((asset) => ({
      label: asset.label,
      capturedAt: asset.createdAt.toISOString(),
      reviewedByPeople: false,
    }));
    const { passportSlug } = await writeFinalizedPassport({
      itemId,
      analysisRunId: run.id,
      publicSlug: item.publicId,
      passport,
      evidenceSummary,
      fromState: item.status as ItemState,
    });
    return { outcome: "PUBLISHED", passportSlug };
  }

  if (run.status === "WAITING_FOR_REVIEW" && run.normalizedOutput) {
    const study = await findActiveStudyForItem(itemId);
    if (!study || study.status !== "READY_TO_AGGREGATE") {
      throw new Error(`Item ${itemId}'s review is not ready to aggregate yet`);
    }

    const draftPassport = run.normalizedOutput as unknown as PassportFields;
    const itemClass = draftPassport.category as ItemClass;
    const approvedResponses = await findApprovedResponses(study.id);
    const answers = approvedResponses.map((response) =>
      StudyResponseAnswersSchema.parse(response.answers),
    );

    const reviewOutcome = applyReviewOutcome({
      draftPassport,
      itemClass,
      answers,
      priceCatalog: loadPriceCatalog(),
    });

    const media = await db.mediaAsset.findMany({ where: { itemId } });
    const evidenceSummary = media.map((asset) => ({
      label: asset.label,
      capturedAt: asset.createdAt.toISOString(),
      reviewedByPeople: true,
    }));

    if (reviewOutcome.blocked) {
      await writeRejectedResult({
        itemId,
        analysisRunId: run.id,
        fromState: item.status as ItemState,
      });
      await transitionStudy(
        study.id,
        "COMPLETED",
        completedStudyData(
          study.configuration,
          reviewChangedOutcome(draftPassport, reviewOutcome.passport),
        ),
      );
      return { outcome: "REJECTED" };
    }

    const { passportSlug } = await writeFinalizedPassport({
      itemId,
      analysisRunId: run.id,
      publicSlug: item.publicId,
      passport: reviewOutcome.passport,
      evidenceSummary,
      fromState: item.status as ItemState,
    });
    await transitionStudy(
      study.id,
      "COMPLETED",
      completedStudyData(
        study.configuration,
        reviewChangedOutcome(draftPassport, reviewOutcome.passport),
      ),
    );
    return { outcome: "PUBLISHED", passportSlug };
  }

  throw new Error(`AnalysisRun ${run.id} is not in a finalizable state: ${run.status}`);
}
