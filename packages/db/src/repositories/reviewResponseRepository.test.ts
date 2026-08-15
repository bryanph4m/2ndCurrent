import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../generated/prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    reviewResponse: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
}));

vi.mock("../client", () => ({ db: dbMock }));

const { insertReviewResponse, upsertResponseStatus } = await import("./reviewResponseRepository");

beforeEach(() => {
  vi.clearAllMocks();
});

// Architecture doc section 41 Phase 7 acceptance: "Duplicate submission
// cannot create two responses."
describe("insertReviewResponse", () => {
  it("inserts a new response", async () => {
    dbMock.reviewResponse.create.mockResolvedValue({ id: "resp_1" });

    const result = await insertReviewResponse({
      studyId: "study_1",
      externalSubmissionId: "sub_1",
      answers: { connectorChoice: "usb_c" },
    });

    expect(result).toEqual({ inserted: true, id: "resp_1" });
  });

  it("returns the existing response instead of creating a second one for the same submission", async () => {
    dbMock.reviewResponse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    dbMock.reviewResponse.update.mockResolvedValue({ id: "resp_existing" });

    const result = await insertReviewResponse({
      studyId: "study_1",
      externalSubmissionId: "sub_1",
      answers: { connectorChoice: "usb_c" },
    });

    expect(result).toEqual({ inserted: false, id: "resp_existing" });
    expect(dbMock.reviewResponse.create).toHaveBeenCalledTimes(1);
  });

  it("fills in a placeholder's answers when the webhook created the row first", async () => {
    dbMock.reviewResponse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    dbMock.reviewResponse.update.mockResolvedValue({ id: "resp_placeholder" });

    await insertReviewResponse({
      studyId: "study_1",
      externalSubmissionId: "sub_early",
      answers: { connectorChoice: "usb_c" },
    });

    expect(dbMock.reviewResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { externalSubmissionId: "sub_early" },
        data: expect.objectContaining({ answers: { connectorChoice: "usb_c" } }),
      }),
    );
  });
});

describe("upsertResponseStatus", () => {
  it("creates a placeholder row when the webhook arrives before the response POST", async () => {
    dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 0 });
    dbMock.reviewResponse.create.mockResolvedValue({ id: "resp_placeholder" });

    const result = await upsertResponseStatus({
      studyId: "study_1",
      externalSubmissionId: "sub_early",
      status: "APPROVED",
    });

    expect(result).toEqual({ id: "resp_placeholder", statusChanged: true });
    expect(dbMock.reviewResponse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studyId: "study_1", status: "APPROVED" }),
    });
  });

  it("flips an existing response to APPROVED without touching its answers", async () => {
    dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 1 });
    dbMock.reviewResponse.findUniqueOrThrow.mockResolvedValue({ id: "resp_1" });

    const result = await upsertResponseStatus({
      studyId: "study_1",
      externalSubmissionId: "sub_1",
      status: "APPROVED",
    });

    expect(result).toEqual({ id: "resp_1", statusChanged: true });
    const call = dbMock.reviewResponse.updateMany.mock.calls.at(0)?.[0];
    expect(call?.data.answers).toBeUndefined();
  });

  it("does not count a repeated approval as a new status change", async () => {
    dbMock.reviewResponse.updateMany.mockResolvedValue({ count: 0 });
    dbMock.reviewResponse.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    dbMock.reviewResponse.findUniqueOrThrow.mockResolvedValue({ id: "resp_1" });

    await expect(
      upsertResponseStatus({
        studyId: "study_1",
        externalSubmissionId: "sub_1",
        status: "APPROVED",
      }),
    ).resolves.toEqual({ id: "resp_1", statusChanged: false });
  });
});
