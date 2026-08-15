import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/client";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    item: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    mediaAsset: { findMany: vi.fn() },
    analysisRun: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
    evidenceRequest: { count: vi.fn(), create: vi.fn() },
    serviceOrder: { findFirst: vi.fn() },
    recoveryPassport: { upsert: vi.fn() },
    outboxMessage: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { runItemAnalysis } = await import("./analyzeItemFlow");

const baseItem = {
  id: "item_1",
  publicId: "pub_item_1",
  ownerContactId: "contact_1",
  status: "QUEUED",
  category: null,
  activePolicyVersion: "intake.v1",
};

const dellObservation = (imageRole: "full_item" | "connector" | "label") => ({
  imageRole,
  observedText: ["Dell", "65W"],
  itemCandidates: [
    {
      brand: "Dell",
      model: imageRole === "label" ? "XPS-65W" : null,
      category: "laptop_power_adapter",
      connector: "usb_c",
      confidence: imageRole === "label" ? 0.95 : 0.9,
      evidence: imageRole === "label" ? ["model printed on label"] : ["logo visible"],
    },
  ],
  power: { volts: 20, amps: 3.25, watts: 65, polarity: null, sourceText: "20V 3.25A 65W" },
  condition: { grade: "B" as const, observations: [] },
  safetySignals: {
    batteryVisible: false,
    batterySwellingVisible: false,
    exposedWireVisible: false,
    burnMarkVisible: false,
    crackedMainsHousingVisible: false,
    liquidDamageVisible: false,
    unknownPowerLabel: false,
    notes: [],
  },
  dataRisk: {
    likelyDataBearing: false,
    screenShowsPersonalData: false,
    activationLockRisk: false,
    notes: [],
  },
  missingViews: [],
  uncertaintyNotes: [],
});

const media = [
  {
    itemId: "item_1",
    label: "FULL_ITEM",
    objectKey: "k1",
    sha256: "s1",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    createdAt: new Date("2026-01-01"),
  },
  {
    itemId: "item_1",
    label: "CONNECTOR",
    objectKey: "k2",
    sha256: "s2",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    createdAt: new Date("2026-01-01"),
  },
  {
    itemId: "item_1",
    label: "LABEL",
    objectKey: "k3",
    sha256: "s3",
    mimeType: "image/jpeg",
    sizeBytes: 100,
    createdAt: new Date("2026-01-01"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.item.findUniqueOrThrow.mockResolvedValue(baseItem);
  dbMock.mediaAsset.findMany.mockResolvedValue(media);
  dbMock.analysisRun.count.mockResolvedValue(0);
  dbMock.evidenceRequest.count.mockResolvedValue(0);
  dbMock.serviceOrder.findFirst.mockResolvedValue(null);
  dbMock.item.update.mockResolvedValue({});
  dbMock.analysisRun.update.mockResolvedValue({});
  dbMock.recoveryPassport.upsert.mockResolvedValue({});
  dbMock.evidenceRequest.create.mockResolvedValue({});
  dbMock.outboxMessage.create.mockResolvedValue({});
  dbMock.auditEvent.create.mockResolvedValue({});
});

describe("runItemAnalysis", () => {
  it("finalizes a high-confidence item: writes a passport and marks the item READY", async () => {
    dbMock.analysisRun.create.mockResolvedValue({ id: "run_1" });
    const analyzeImage = vi.fn(
      async ({
        imageRole,
      }: {
        imageRole: "full_item" | "connector" | "label" | "damage" | "other";
      }) => dellObservation(imageRole as "full_item" | "connector" | "label"),
    );

    const result = await runItemAnalysis("item_1", analyzeImage);

    expect(result).toEqual({ outcome: "FINALIZED", passportSlug: "pub_item_1" });
    expect(dbMock.recoveryPassport.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = dbMock.recoveryPassport.upsert.mock.calls[0]![0];
    expect(upsertArgs.create.publicSlug).toBe("pub_item_1");
    expect(upsertArgs.create.recommendedRoute).toBe("RESELL");
    expect(upsertArgs.create.suggestedPriceCents).toBe(1200);

    const lastItemUpdate = dbMock.item.update.mock.calls.at(-1)![0];
    expect(lastItemUpdate.data.status).toBe("READY");
    expect(lastItemUpdate.data.finalRoute).toBe("RESELL");
    expect(lastItemUpdate.data.currentAnalysisId).toBe("run_1");

    expect(dbMock.analysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run_1" },
        data: expect.objectContaining({ status: "FINALIZED" }),
      }),
    );

    // Architecture doc section 16.8: the passport row itself must never carry
    // the contact id or a media object key - evidenceSummary is built from
    // label + capturedAt only (analyzeItemFlow.ts). itemId legitimately
    // appears in the write (it targets the row); the public page never sees
    // it, since findPublishedPassportBySlug's select omits id and itemId
    // (see passportRepository.test.ts).
    const writtenFields = JSON.stringify({ create: upsertArgs.create, update: upsertArgs.update });
    expect(writtenFields).not.toContain("contact_1");
    expect(writtenFields).not.toContain("k1");
    expect(writtenFields).not.toContain("k2");
    expect(writtenFields).not.toContain("k3");
  });

  it("treats a retried task run as already claimed instead of re-analyzing", async () => {
    dbMock.analysisRun.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const analyzeImage = vi.fn();

    const result = await runItemAnalysis("item_1", analyzeImage);

    expect(result).toEqual({ outcome: "ALREADY_CLAIMED" });
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(dbMock.item.update).not.toHaveBeenCalled();
  });
});
