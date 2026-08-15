import type { ReviewDecision } from "@secondcurrent/domain";
import { db } from "./client";
import { Prisma } from "../generated/prisma/client";
import { loadStudyTemplate } from "./studyTemplate";
import {
  createDraftStudy,
  findActiveStudyForItem,
  transitionStudy,
} from "./repositories/reviewStudyRepository";

export type CreateHumanReviewDraft = (input: {
  title: string;
  internalTitle: string;
  numParticipants: number;
  taskUrl: string;
}) => Promise<{ externalOpportunityId: string; quotedCostCents: number }>;

export type LaunchHumanReview = (externalOpportunityId: string) => Promise<void>;

export type CreateAndLaunchStudyResult =
  | { outcome: "LAUNCHED"; studyId: string; token: string }
  | { outcome: "ALREADY_EXISTS"; studyId: string }
  | { outcome: "BUDGET_EXCEEDED"; studyId: string }
  | { outcome: "NOT_WAITING_FOR_REVIEW" };

async function recordCommittedReviewCost(input: {
  itemId: string;
  studyId: string;
  externalOpportunityId: string | null;
  costCents: number | null;
}): Promise<void> {
  const costCents = input.costCents;
  if (!costCents || costCents < 1) return;

  const order = await db.serviceOrder.findFirst({
    where: {
      itemId: input.itemId,
      status: { in: ["PAID", "FULFILLING", "COMPLETED"] },
    },
    orderBy: { paidAt: "desc" },
  });
  if (!order) {
    throw new Error(`No paid order exists for review study ${input.studyId}`);
  }

  await db.$transaction(async (tx) => {
    await tx.reviewStudy.update({
      where: { id: input.studyId },
      data: { actualCostCents: costCents },
    });
    await tx.ledgerEntry.upsert({
      where: { id: `human-review-cost:${input.studyId}` },
      create: {
        id: `human-review-cost:${input.studyId}`,
        orderId: order.id,
        type: "HUMAN_REVIEW_COST",
        amountCents: -costCents,
        currency: order.currency,
        providerReference: input.externalOpportunityId,
        note: `Human review cost for study ${input.studyId}`,
      },
      update: {},
    });
  });
}

// Section 17.2's "createAndLaunchItemStudy": builds the ReviewStudy row from
// the review decision Phase 5 already stored on the item's AnalysisRun, then
// creates and launches the Terac opportunity. Section 22.2's launch rule
// ("no hard safety block") is already guaranteed here - a hard block never
// produces a WAITING_FOR_REVIEW item (packages/domain's analyzeItem.ts) -
// the remaining rule this enforces is the budget fit. The "public study page
// passes a local smoke test" rule is a deploy-time check, not a runtime one.
export async function createAndLaunchItemStudy(
  itemId: string,
  deps: { createDraft: CreateHumanReviewDraft; launch: LaunchHumanReview; appBaseUrl: string },
): Promise<CreateAndLaunchStudyResult> {
  const item = await db.item.findUniqueOrThrow({ where: { id: itemId } });
  if (item.status !== "WAITING_FOR_REVIEW") {
    return { outcome: "NOT_WAITING_FOR_REVIEW" };
  }

  const existing = await findActiveStudyForItem(itemId);
  if (existing) {
    if (["LAUNCHED", "COLLECTING", "READY_TO_AGGREGATE", "COMPLETED"].includes(existing.status)) {
      await recordCommittedReviewCost({
        itemId,
        studyId: existing.id,
        externalOpportunityId: existing.externalOpportunityId,
        costCents: existing.actualCostCents ?? existing.quotedCostCents,
      });
    }
    return { outcome: "ALREADY_EXISTS", studyId: existing.id };
  }

  const run = await db.analysisRun.findFirst({
    where: { itemId, status: "WAITING_FOR_REVIEW" },
    orderBy: { version: "desc" },
  });
  if (!run?.reviewDecision) {
    throw new Error(`No review decision to launch a study from for item ${itemId}`);
  }
  const review = run.reviewDecision as unknown as ReviewDecision;

  const template = loadStudyTemplate();
  const { id: studyId, token } = await createDraftStudy({
    itemId,
    type: "ITEM_VERIFICATION",
    templateVersion: template.version,
    targetParticipants: review.participantCount,
    configuration: template as unknown as Prisma.InputJsonValue,
  });

  const draft = await deps.createDraft({
    title: template.title,
    internalTitle: `SecondCurrent item verification ${itemId}`,
    numParticipants: review.participantCount,
    taskUrl: `${deps.appBaseUrl}/study/${token}`,
  });

  // The draft opportunity already exists at Terac by this point, so the
  // study genuinely reached CREATED_AT_PROVIDER even when the budget check
  // below refuses to launch it - DRAFT only transitions to CANCELED, never
  // straight to FAILED (packages/domain's study state machine).
  await transitionStudy(studyId, "CREATED_AT_PROVIDER", {
    externalOpportunityId: draft.externalOpportunityId,
    quotedCostCents: draft.quotedCostCents,
  });

  if (draft.quotedCostCents > review.maximumCostCents) {
    await transitionStudy(studyId, "FAILED");
    return { outcome: "BUDGET_EXCEEDED", studyId };
  }

  await deps.launch(draft.externalOpportunityId);
  await transitionStudy(studyId, "LAUNCHED", { launchedAt: new Date() });
  await transitionStudy(studyId, "COLLECTING");
  await recordCommittedReviewCost({
    itemId,
    studyId,
    externalOpportunityId: draft.externalOpportunityId,
    costCents: draft.quotedCostCents,
  });

  return { outcome: "LAUNCHED", studyId, token };
}
