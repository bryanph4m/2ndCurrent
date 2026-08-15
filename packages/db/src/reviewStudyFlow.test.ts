import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    item: { findUniqueOrThrow: vi.fn() },
    reviewStudy: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    analysisRun: { findFirst: vi.fn() },
    serviceOrder: { findFirst: vi.fn() },
    ledgerEntry: { upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { createAndLaunchItemStudy } = await import("./reviewStudyFlow");

const reviewDecision = {
  required: true,
  participantCount: 3,
  reasonCodes: ["LOW_CONFIDENCE"],
  maximumCostCents: 2000,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.reviewStudy.findFirst.mockResolvedValue(null);
  dbMock.reviewStudy.create.mockResolvedValue({ id: "study_1" });
  dbMock.reviewStudy.findUniqueOrThrow.mockImplementation(async () => ({
    id: "study_1",
    itemId: "item_1",
    status: dbMock.reviewStudy.update.mock.calls.at(-1)?.[0]?.data?.status ?? "DRAFT",
  }));
  dbMock.reviewStudy.update.mockResolvedValue({});
  dbMock.analysisRun.findFirst.mockResolvedValue({ id: "run_1", reviewDecision });
  dbMock.serviceOrder.findFirst.mockResolvedValue({
    id: "order_1",
    currency: "USD",
  });
  dbMock.ledgerEntry.upsert.mockResolvedValue({});
});

describe("createAndLaunchItemStudy", () => {
  it("creates a draft, launches it, and moves the study through to COLLECTING", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "WAITING_FOR_REVIEW" });
    const createDraft = vi
      .fn()
      .mockResolvedValue({ externalOpportunityId: "opp_1", quotedCostCents: 1500 });
    const launch = vi.fn().mockResolvedValue(undefined);

    const result = await createAndLaunchItemStudy("item_1", {
      createDraft,
      launch,
      appBaseUrl: "http://localhost:3000",
    });

    expect(result.outcome).toBe("LAUNCHED");
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        numParticipants: 3,
        taskUrl: expect.stringContaining("http://localhost:3000/study/"),
      }),
    );
    expect(launch).toHaveBeenCalledWith("opp_1");
    expect(dbMock.reviewStudy.update).toHaveBeenCalledWith({
      where: { id: "study_1" },
      data: { actualCostCents: 1500 },
    });
    expect(dbMock.ledgerEntry.upsert).toHaveBeenCalledWith({
      where: { id: "human-review-cost:study_1" },
      create: expect.objectContaining({
        orderId: "order_1",
        type: "HUMAN_REVIEW_COST",
        amountCents: -1500,
        providerReference: "opp_1",
      }),
      update: {},
    });
  });

  it("fails the draft instead of launching when the quoted cost exceeds the budget", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "WAITING_FOR_REVIEW" });
    const createDraft = vi
      .fn()
      .mockResolvedValue({ externalOpportunityId: "opp_1", quotedCostCents: 5000 });
    const launch = vi.fn();

    const result = await createAndLaunchItemStudy("item_1", {
      createDraft,
      launch,
      appBaseUrl: "http://localhost:3000",
    });

    expect(result).toEqual({ outcome: "BUDGET_EXCEEDED", studyId: "study_1" });
    expect(launch).not.toHaveBeenCalled();
  });

  it("does not create a second study for an item that already has one", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "WAITING_FOR_REVIEW" });
    dbMock.reviewStudy.findFirst.mockResolvedValue({ id: "study_existing" });
    const createDraft = vi.fn();

    const result = await createAndLaunchItemStudy("item_1", {
      createDraft,
      launch: vi.fn(),
      appBaseUrl: "http://localhost:3000",
    });

    expect(result).toEqual({ outcome: "ALREADY_EXISTS", studyId: "study_existing" });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("does nothing for an item that is not waiting for review", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "READY" });

    const result = await createAndLaunchItemStudy("item_1", {
      createDraft: vi.fn(),
      launch: vi.fn(),
      appBaseUrl: "http://localhost:3000",
    });

    expect(result).toEqual({ outcome: "NOT_WAITING_FOR_REVIEW" });
  });
});
