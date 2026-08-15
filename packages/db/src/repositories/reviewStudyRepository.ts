import { createHash, randomBytes } from "node:crypto";
import { assertStudyTransition, type StudyState } from "@secondcurrent/domain";
import { db } from "../client";
import { Prisma } from "../../generated/prisma/client";
import { transitionWithAudit } from "../audit";

// The token in the public /study/[token] URL is the bearer credential
// (section 16.6: "resolve the study from a hash of the path token"), so only
// its hash is stored - a plain SHA-256 is enough since the token itself
// carries the entropy, unlike a phone number (see packages/domain's
// hashPhone, which needs a secret key because phone numbers do not).
export function hashStudyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateStudyToken(): string {
  return randomBytes(24).toString("base64url");
}

export type CreateReviewStudyInput = {
  itemId: string;
  type: "ITEM_VERIFICATION";
  templateVersion: string;
  targetParticipants: number;
  configuration: Prisma.InputJsonValue;
};

export async function createDraftStudy(
  input: CreateReviewStudyInput,
): Promise<{ id: string; token: string }> {
  const token = generateStudyToken();
  const study = await db.reviewStudy.create({
    data: {
      itemId: input.itemId,
      type: input.type,
      status: "DRAFT",
      templateVersion: input.templateVersion,
      publicTokenHash: hashStudyToken(token),
      targetParticipants: input.targetParticipants,
      configuration: input.configuration,
    },
  });
  return { id: study.id, token };
}

export function findStudyByTokenHash(tokenHash: string) {
  return db.reviewStudy.findUnique({ where: { publicTokenHash: tokenHash } });
}

export function findStudyByExternalOpportunityId(externalOpportunityId: string) {
  return db.reviewStudy.findUnique({ where: { externalOpportunityId } });
}

export function findActiveStudyForItem(itemId: string) {
  return db.reviewStudy.findFirst({
    where: { itemId, status: { notIn: ["FAILED", "CANCELED"] } },
    orderBy: { createdAt: "desc" },
  });
}

// The study page (section 16.6) uses this to seed the connector/identity
// dropdown options with the model's own guess, so reviewers are confirming
// or correcting a candidate rather than typing one from nothing.
export async function findDraftPassportForItem(itemId: string) {
  const run = await db.analysisRun.findFirst({
    where: { itemId, status: "WAITING_FOR_REVIEW" },
    orderBy: { version: "desc" },
  });
  return run?.normalizedOutput as
    { brand: string | null; model: string | null; connector: string | null } | undefined;
}

export async function transitionStudy(
  studyId: string,
  to: StudyState,
  extra?: Prisma.ReviewStudyUpdateInput,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const study = await tx.reviewStudy.findUniqueOrThrow({ where: { id: studyId } });
    await transitionWithAudit({
      tx,
      entityType: "ReviewStudy",
      entityId: studyId,
      itemId: study.itemId,
      actorType: "system",
      action: "study.transition",
      from: study.status as StudyState,
      to,
      assertFn: assertStudyTransition,
      applyUpdate: () =>
        tx.reviewStudy.update({ where: { id: studyId }, data: { status: to, ...extra } }),
    });
  });
}

// Section 17.3: "Update approvedResponses with a transaction-safe query" -
// an atomic increment, not read-then-write, so two concurrent approvals can
// never both observe "target not yet met" and each start their own
// finalize-item task.
export async function incrementApprovedResponses(studyId: string) {
  return db.reviewStudy.update({
    where: { id: studyId },
    data: { approvedResponses: { increment: 1 } },
  });
}
