import { db } from "../client";
import { Prisma } from "../../generated/prisma/client";

export type InsertReviewResponseInput = {
  studyId: string;
  externalSubmissionId: string;
  externalTaskId?: string;
  answers: Prisma.InputJsonValue;
};

export type InsertReviewResponseResult = { inserted: boolean; id: string };

// @@unique on externalSubmissionId makes a duplicate response POST a no-op
// instead of a second row (section 41 Phase 7 acceptance: "Duplicate
// submission cannot create two responses"). Same insert-then-catch pattern
// used everywhere else idempotency matters in this codebase. On a conflict,
// the existing row may be a genuine resubmission or a placeholder that
// upsertResponseStatus created because the Terac webhook arrived first -
// either way, write this POST's answers into it rather than leaving a
// placeholder with no answers.
export async function insertReviewResponse(
  input: InsertReviewResponseInput,
): Promise<InsertReviewResponseResult> {
  try {
    const response = await db.reviewResponse.create({
      data: {
        studyId: input.studyId,
        externalSubmissionId: input.externalSubmissionId,
        externalTaskId: input.externalTaskId ?? null,
        answers: input.answers,
        status: "RECEIVED",
      },
    });
    return { inserted: true, id: response.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.reviewResponse.update({
        where: { externalSubmissionId: input.externalSubmissionId },
        data: { answers: input.answers, externalTaskId: input.externalTaskId ?? null },
      });
      return { inserted: false, id: existing.id };
    }
    throw error;
  }
}

export function findResponseBySubmissionId(externalSubmissionId: string) {
  return db.reviewResponse.findUnique({ where: { externalSubmissionId } });
}

export function findApprovedResponses(studyId: string) {
  return db.reviewResponse.findMany({ where: { studyId, status: "APPROVED" } });
}

// Section 17.3 step 2 ("update the matching response"), but as an upsert:
// Terac's webhook can arrive before the study page's response POST (a real
// possibility with auto_approve tasks), so there may be no row yet. The
// caller resolves the study from the webhook's externalOpportunityId (stable
// from CREATED_AT_PROVIDER onward) rather than from this row, so counting
// never depends on response-POST ordering; a placeholder created here gets
// its answers filled in by insertReviewResponse once the POST lands.
export async function upsertResponseStatus(input: {
  studyId: string;
  externalSubmissionId: string;
  status: "APPROVED" | "REJECTED";
}): Promise<{ id: string; statusChanged: boolean }> {
  const timestamp =
    input.status === "APPROVED" ? { approvedAt: new Date() } : { rejectedAt: new Date() };
  const updated = await db.reviewResponse.updateMany({
    where: {
      externalSubmissionId: input.externalSubmissionId,
      status: { not: input.status },
    },
    data: { status: input.status, ...timestamp },
  });
  if (updated.count === 1) {
    const response = await db.reviewResponse.findUniqueOrThrow({
      where: { externalSubmissionId: input.externalSubmissionId },
    });
    return { id: response.id, statusChanged: true };
  }

  try {
    const response = await db.reviewResponse.create({
      data: {
        studyId: input.studyId,
        externalSubmissionId: input.externalSubmissionId,
        status: input.status,
        ...timestamp,
      },
    });
    return { id: response.id, statusChanged: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    const response = await db.reviewResponse.findUniqueOrThrow({
      where: { externalSubmissionId: input.externalSubmissionId },
    });
    return { id: response.id, statusChanged: false };
  }
}
