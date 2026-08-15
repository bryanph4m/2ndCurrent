import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    reviewResponse: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    reviewStudy: { update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { processTeracApproval } = await import("./teracApprovalFlow");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 1 });
  dbMock.reviewResponse.findUniqueOrThrow.mockResolvedValue({ id: "resp_1" });
});

describe("processTeracApproval", () => {
  it("counts an approval but does not move the study to READY_TO_AGGREGATE below target", async () => {
    dbMock.reviewStudy.findUnique.mockResolvedValue({ id: "study_1", itemId: "item_1" });
    dbMock.reviewStudy.update.mockResolvedValue({
      id: "study_1",
      itemId: "item_1",
      approvedResponses: 2,
      targetParticipants: 3,
      status: "COLLECTING",
    });

    const result = await processTeracApproval({
      status: "approved",
      externalOpportunityId: "opp_1",
      externalSubmissionId: "sub_1",
    });

    expect(result).toEqual({
      outcome: "COUNTED",
      studyId: "study_1",
      itemId: "item_1",
      readyToAggregate: false,
    });
    expect(dbMock.reviewStudy.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("moves the study to READY_TO_AGGREGATE the moment the target is met", async () => {
    dbMock.reviewStudy.findUnique.mockResolvedValue({ id: "study_1", itemId: "item_1" });
    dbMock.reviewStudy.update.mockResolvedValue({
      id: "study_1",
      itemId: "item_1",
      approvedResponses: 3,
      targetParticipants: 3,
      status: "COLLECTING",
    });
    dbMock.reviewStudy.findUniqueOrThrow.mockResolvedValue({
      id: "study_1",
      itemId: "item_1",
      status: "COLLECTING",
    });

    const result = await processTeracApproval({
      status: "approved",
      externalOpportunityId: "opp_1",
      externalSubmissionId: "sub_3",
    });

    expect(result).toEqual({
      outcome: "COUNTED",
      studyId: "study_1",
      itemId: "item_1",
      readyToAggregate: true,
    });
    expect(dbMock.reviewStudy.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "READY_TO_AGGREGATE" }) }),
    );
  });

  // The bug this closes: the study used to be resolved through the
  // ReviewResponse row, so an approval that outran the response POST had
  // nothing to find and was silently dropped. Resolving through the
  // opportunity ID (stable since CREATED_AT_PROVIDER) means an early
  // approval still counts and creates a placeholder response row.
  it("counts an approval that arrives before the response POST", async () => {
    dbMock.reviewStudy.findUnique.mockResolvedValue({ id: "study_1", itemId: "item_1" });
    dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 0 });
    dbMock.reviewResponse.create.mockResolvedValue({ id: "resp_placeholder" });
    dbMock.reviewStudy.update.mockResolvedValue({
      id: "study_1",
      itemId: "item_1",
      approvedResponses: 1,
      targetParticipants: 3,
      status: "COLLECTING",
    });

    const result = await processTeracApproval({
      status: "approved",
      externalOpportunityId: "opp_1",
      externalSubmissionId: "sub_early",
    });

    expect(result.outcome).toBe("COUNTED");
    expect(dbMock.reviewResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalSubmissionId: "sub_early" }),
      }),
    );
  });

  it("returns STUDY_NOT_FOUND when the opportunity ID does not match a study", async () => {
    dbMock.reviewStudy.findUnique.mockResolvedValue(null);

    const result = await processTeracApproval({
      status: "approved",
      externalOpportunityId: "opp_missing",
      externalSubmissionId: "sub_1",
    });

    expect(result).toEqual({ outcome: "STUDY_NOT_FOUND" });
    expect(dbMock.reviewResponse.updateMany).not.toHaveBeenCalled();
  });

  it("ignores a received status without touching the database", async () => {
    const result = await processTeracApproval({
      status: "received",
      externalOpportunityId: "opp_1",
      externalSubmissionId: "sub_1",
    });
    expect(result).toEqual({ outcome: "IGNORED" });
    expect(dbMock.reviewStudy.findUnique).not.toHaveBeenCalled();
  });

  it("does not increment the study twice for a repeated approval", async () => {
    dbMock.reviewStudy.findUnique.mockResolvedValue({
      id: "study_1",
      itemId: "item_1",
      approvedResponses: 3,
      targetParticipants: 3,
      status: "READY_TO_AGGREGATE",
    });
    dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 0 });
    dbMock.reviewResponse.create.mockRejectedValue(
      new (await import("../generated/prisma/client")).Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" },
      ),
    );
    dbMock.reviewResponse.findUniqueOrThrow.mockResolvedValue({ id: "resp_1" });

    await expect(
      processTeracApproval({
        status: "approved",
        externalOpportunityId: "opp_1",
        externalSubmissionId: "sub_1",
      }),
    ).resolves.toEqual({
      outcome: "COUNTED",
      studyId: "study_1",
      itemId: "item_1",
      readyToAggregate: true,
    });
    expect(dbMock.reviewStudy.update).not.toHaveBeenCalled();
  });
});
