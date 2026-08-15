import { describe, expect, it } from "vitest";
import { decideRoute } from "./route";

const clearSafety = {
  status: "CLEAR" as const,
  hardBlock: false,
  softReview: false,
  reasonCodes: [],
};
const clearDataRisk = { blocking: false, needsReview: false, reasonCodes: [] };
const noMissingEvidence = { missingRequired: [], canRequestMore: false, requestNumber: 1 };

describe("decideRoute", () => {
  it("blocks on a hard safety rule before anything else", () => {
    const result = decideRoute({
      safety: { ...clearSafety, hardBlock: true },
      dataRisk: clearDataRisk,
      evidence: noMissingEvidence,
      price: null,
      conditionGrade: "A",
      identityConfidence: 0.95,
    });
    expect(result.route).toBe("DO_NOT_LIST");
  });

  it("blocks on unresolved data risk", () => {
    const result = decideRoute({
      safety: clearSafety,
      dataRisk: { blocking: true, needsReview: true, reasonCodes: ["x"] },
      evidence: noMissingEvidence,
      price: null,
      conditionGrade: "A",
      identityConfidence: 0.95,
    });
    expect(result.route).toBe("DO_NOT_LIST");
  });

  it("asks for more evidence before pricing or routing", () => {
    const result = decideRoute({
      safety: clearSafety,
      dataRisk: clearDataRisk,
      evidence: { missingRequired: ["label"], canRequestMore: true, requestNumber: 1 },
      price: null,
      conditionGrade: "UNKNOWN",
      identityConfidence: 0.5,
    });
    expect(result.route).toBe("NEEDS_MORE_EVIDENCE");
  });

  it("recommends resell for a confident, priced, clear item", () => {
    const result = decideRoute({
      safety: clearSafety,
      dataRisk: clearDataRisk,
      evidence: noMissingEvidence,
      price: { lowCents: 800, midCents: 1200, highCents: 1600, quotedCents: 1200 },
      conditionGrade: "B",
      identityConfidence: 0.9,
    });
    expect(result.route).toBe("RESELL");
  });

  it("recommends donate for a confident item with no resale value", () => {
    const result = decideRoute({
      safety: clearSafety,
      dataRisk: clearDataRisk,
      evidence: noMissingEvidence,
      price: null,
      conditionGrade: "B",
      identityConfidence: 0.9,
    });
    expect(result.route).toBe("DONATE");
  });

  it("recommends recycle for major visible damage", () => {
    const result = decideRoute({
      safety: clearSafety,
      dataRisk: clearDataRisk,
      evidence: noMissingEvidence,
      price: null,
      conditionGrade: "D",
      identityConfidence: 0.9,
    });
    expect(result.route).toBe("RECYCLE");
  });
});
