import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    reviewStudy: { create: vi.fn(), findMany: vi.fn() },
    reviewResponse: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    humanFinding: { create: vi.fn() },
    productChange: { create: vi.fn(), findMany: vi.fn() },
    metricSnapshot: { upsert: vi.fn(), findMany: vi.fn() },
    serviceOrder: { findMany: vi.fn() },
    ledgerEntry: { findMany: vi.fn() },
    impactEvent: { findMany: vi.fn() },
    workflowRun: { findMany: vi.fn() },
    outboxMessage: { findMany: vi.fn() },
    webhookEvent: { findMany: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const {
  createMeasurementStudy,
  getJudgingDashboard,
  recordFindingAndProductChange,
  storeStudyMetrics,
} = await import("./measurementFlow");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.workflowRun.findMany.mockResolvedValue([]);
  dbMock.outboxMessage.findMany.mockResolvedValue([]);
  dbMock.webhookEvent.findMany.mockResolvedValue([]);
});

describe("measurement flow", () => {
  it("creates a blind comparison with randomized A/B order", async () => {
    dbMock.reviewStudy.create.mockResolvedValue({ id: "study_1" });

    const result = await createMeasurementStudy({
      type: "BLIND_COMPARISON",
      templateVersion: "blind-comparison.v1",
      targetParticipants: 10,
      baselinePolicyVersion: "passport.v0",
      revisedPolicyVersion: "passport.v1",
      randomValue: 0.75,
    });

    expect(result.variantOrder).toEqual(["REVISED", "BASELINE"]);
    expect(dbMock.reviewStudy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "BLIND_COMPARISON",
        configuration: expect.objectContaining({ blind: true }),
      }),
    });
  });

  it("links each product change to a stored human finding", async () => {
    dbMock.reviewResponse.findUniqueOrThrow.mockResolvedValue({
      id: "response_1",
      studyId: "study_1",
    });
    dbMock.humanFinding.create.mockResolvedValue({ id: "finding_1" });
    dbMock.productChange.create.mockResolvedValue({ id: "change_1" });

    await expect(
      recordFindingAndProductChange({
        studyId: "study_1",
        sourceResponseId: "response_1",
        findingCode: "MISSING_CONNECTOR_VIEW",
        findingText: "Reviewers could not confirm the connector.",
        changeCode: "REQUIRE_CONNECTOR_CLOSE_UP",
      }),
    ).resolves.toEqual({ humanFindingId: "finding_1", productChangeId: "change_1" });

    expect(dbMock.productChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ humanFindingId: "finding_1" }),
    });
  });

  it("stores baseline and revised snapshots separately with raw sample sizes", async () => {
    dbMock.metricSnapshot.upsert.mockResolvedValue({});
    const response = {
      identityCorrect: true,
      trustRating: 6,
      purchaseIntentRating: 5,
      routeAgrees: true,
      missingEvidence: false,
    };

    await storeStudyMetrics({
      studyId: "study_1",
      baselineResponses: [response],
      revisedResponses: [response, response],
    });

    expect(dbMock.metricSnapshot.upsert).toHaveBeenCalledTimes(2);
    expect(dbMock.metricSnapshot.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({ variant: "BASELINE", sampleSize: 1 }),
      }),
    );
    expect(dbMock.metricSnapshot.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({ variant: "REVISED", sampleSize: 2 }),
      }),
    );
  });

  it("keeps sponsored credits separate from market costs", async () => {
    dbMock.serviceOrder.findMany.mockResolvedValue([]);
    dbMock.reviewStudy.findMany.mockResolvedValue([]);
    dbMock.metricSnapshot.findMany.mockResolvedValue([]);
    dbMock.productChange.findMany.mockResolvedValue([]);
    dbMock.impactEvent.findMany.mockResolvedValue([]);
    dbMock.ledgerEntry.findMany.mockResolvedValue([
      { type: "SERVICE_REVENUE", amountCents: 500 },
      { type: "HUMAN_REVIEW_COST", amountCents: -200 },
      { type: "SPONSORED_CREDIT", amountCents: 200 },
    ]);

    const dashboard = await getJudgingDashboard();
    expect(dashboard.business).toMatchObject({
      serviceRevenueCents: 500,
      marketCostCents: 200,
      sponsoredCreditCents: 200,
      grossMarginCents: 300,
    });
  });

  it("reports human cost per corrected item and responses per resolved ambiguity", async () => {
    dbMock.serviceOrder.findMany.mockResolvedValue([]);
    dbMock.metricSnapshot.findMany.mockResolvedValue([]);
    dbMock.productChange.findMany.mockResolvedValue([]);
    dbMock.impactEvent.findMany.mockResolvedValue([]);
    dbMock.ledgerEntry.findMany.mockResolvedValue([
      { type: "HUMAN_REVIEW_COST", amountCents: -900 },
    ]);
    dbMock.reviewStudy.findMany.mockResolvedValue([
      {
        id: "study_1",
        type: "ITEM_VERIFICATION",
        status: "COMPLETED",
        approvedResponses: 3,
        targetParticipants: 3,
        quotedCostCents: 450,
        actualCostCents: 450,
        configuration: { outcomeMetrics: { correctedItem: true } },
      },
      {
        id: "study_2",
        type: "ITEM_VERIFICATION",
        status: "COMPLETED",
        approvedResponses: 5,
        targetParticipants: 5,
        quotedCostCents: 450,
        actualCostCents: 450,
        configuration: { outcomeMetrics: { correctedItem: false } },
      },
    ]);

    const dashboard = await getJudgingDashboard();
    expect(dashboard.reviewEfficiency).toEqual({
      correctedItems: 1,
      resolvedAmbiguities: 2,
      humanCostPerCorrectedItemCents: 900,
      responsesPerResolvedAmbiguity: 4,
    });
  });
});
