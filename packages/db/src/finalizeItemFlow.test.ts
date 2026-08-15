import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    item: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    analysisRun: { findFirst: vi.fn() },
    mediaAsset: { findMany: vi.fn() },
    recoveryPassport: { upsert: vi.fn() },
    reviewStudy: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    reviewResponse: { findMany: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { finalizeItem } = await import("./finalizeItemFlow");

const passport = {
  title: "Dell power adapter",
  brand: "Dell",
  model: "XPS-65W",
  category: "power_adapter",
  connector: "usb_c",
  powerText: "20V 3.25A 65W",
  conditionGrade: "B",
  identityConfidence: 0.95,
  safetyStatus: "CLEAR",
  dataRisk: "CLEAR",
  recommendedRoute: "RESELL",
  suggestedPriceCents: 1200,
  knownFacts: ["The brand is Dell."],
  unknownFacts: [],
  disclaimer: "This item record is based on photos and reported evidence.",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.item.update.mockResolvedValue({});
  dbMock.recoveryPassport.upsert.mockResolvedValue({});
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.mediaAsset.findMany.mockResolvedValue([
    { label: "FULL_ITEM", createdAt: new Date("2026-01-01") },
  ]);
});

describe("finalizeItem", () => {
  it("is a no-op when the item already reached READY", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "READY" });

    const result = await finalizeItem("item_1");

    expect(result).toEqual({ outcome: "NO_OP" });
    expect(dbMock.analysisRun.findFirst).not.toHaveBeenCalled();
  });

  it("is a no-op when the item already reached REJECTED", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "REJECTED" });

    const result = await finalizeItem("item_1");

    expect(result).toEqual({ outcome: "NO_OP" });
  });

  it("reloads a finalized analysis run and publishes the passport", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_1",
      publicId: "pub_item_1",
      status: "ANALYZING",
    });
    dbMock.analysisRun.findFirst.mockResolvedValue({
      id: "run_1",
      status: "FINALIZED",
      normalizedOutput: passport,
    });

    const result = await finalizeItem("item_1");

    expect(result).toEqual({ outcome: "PUBLISHED", passportSlug: "pub_item_1" });
    expect(dbMock.recoveryPassport.upsert).toHaveBeenCalledTimes(1);
    const lastItemUpdate = dbMock.item.update.mock.calls.at(-1)![0];
    expect(lastItemUpdate.data.status).toBe("READY");
    expect(lastItemUpdate.data.currentAnalysisId).toBe("run_1");
  });

  it("reloads a rejected analysis run and transitions the item to REJECTED", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_1",
      publicId: "pub_item_1",
      status: "ANALYZING",
    });
    dbMock.analysisRun.findFirst.mockResolvedValue({ id: "run_1", status: "REJECTED" });

    const result = await finalizeItem("item_1");

    expect(result).toEqual({ outcome: "REJECTED" });
    expect(dbMock.item.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { status: "REJECTED", currentAnalysisId: "run_1" },
    });
  });

  it("throws when there is no analysis run to finalize from", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({ id: "item_1", status: "ANALYZING" });
    dbMock.analysisRun.findFirst.mockResolvedValue(null);

    await expect(finalizeItem("item_1")).rejects.toThrow("No AnalysisRun");
  });

  // Architecture doc section 41 Phase 7 acceptance: "Mock three-person
  // review finalizes the ambiguous charger."
  describe("WAITING_FOR_REVIEW", () => {
    const ambiguousDraftPassport = {
      ...passport,
      identityConfidence: 0.75,
      safetyStatus: "NEEDS_REVIEW",
      recommendedRoute: "DONATE",
      suggestedPriceCents: null,
    };

    function approvedAnswer(overrides: Record<string, unknown> = {}) {
      return {
        answers: {
          connectorChoice: "usb_c",
          labelReadable: true,
          identityCandidate: "Dell",
          conditionAgreement: 6,
          missingEvidence: [],
          safetyConcern: false,
          ...overrides,
        },
      };
    }

    beforeEach(() => {
      dbMock.item.findUniqueOrThrow.mockResolvedValue({
        id: "item_1",
        publicId: "pub_item_1",
        status: "WAITING_FOR_REVIEW",
      });
      dbMock.analysisRun.findFirst.mockResolvedValue({
        id: "run_1",
        status: "WAITING_FOR_REVIEW",
        normalizedOutput: ambiguousDraftPassport,
      });
    });

    it("finalizes the ambiguous charger once three reviewers agree", async () => {
      dbMock.reviewStudy.findFirst.mockResolvedValue({
        id: "study_1",
        status: "READY_TO_AGGREGATE",
        configuration: { questions: [] },
      });
      dbMock.reviewStudy.findUniqueOrThrow.mockResolvedValue({
        id: "study_1",
        itemId: "item_1",
        status: "READY_TO_AGGREGATE",
      });
      dbMock.reviewResponse.findMany.mockResolvedValue([
        approvedAnswer(),
        approvedAnswer(),
        approvedAnswer({ conditionAgreement: 7 }),
      ]);

      const result = await finalizeItem("item_1");

      expect(result).toEqual({ outcome: "PUBLISHED", passportSlug: "pub_item_1" });
      const upsertArgs = dbMock.recoveryPassport.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.recommendedRoute).toBe("RESELL");
      expect(upsertArgs.create.evidenceSummary[0].reviewedByPeople).toBe(true);
      expect(dbMock.reviewStudy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "COMPLETED",
            configuration: {
              questions: [],
              outcomeMetrics: { correctedItem: true },
            },
          }),
        }),
      );
    });

    it("rejects the item when reviewers flag a safety concern", async () => {
      dbMock.reviewStudy.findFirst.mockResolvedValue({
        id: "study_1",
        status: "READY_TO_AGGREGATE",
        configuration: { questions: [] },
      });
      dbMock.reviewStudy.findUniqueOrThrow.mockResolvedValue({
        id: "study_1",
        itemId: "item_1",
        status: "READY_TO_AGGREGATE",
      });
      dbMock.reviewResponse.findMany.mockResolvedValue([
        approvedAnswer({ safetyConcern: true }),
        approvedAnswer({ safetyConcern: true }),
        approvedAnswer(),
      ]);

      const result = await finalizeItem("item_1");

      expect(result).toEqual({ outcome: "REJECTED" });
      expect(dbMock.recoveryPassport.upsert).not.toHaveBeenCalled();
    });

    it("throws instead of finalizing early when the study is not ready to aggregate", async () => {
      dbMock.reviewStudy.findFirst.mockResolvedValue({ id: "study_1", status: "COLLECTING" });

      await expect(finalizeItem("item_1")).rejects.toThrow("not ready to aggregate");
      expect(dbMock.recoveryPassport.upsert).not.toHaveBeenCalled();
    });
  });
});
