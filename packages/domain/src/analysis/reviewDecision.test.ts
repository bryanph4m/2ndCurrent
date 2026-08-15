import { describe, expect, it } from "vitest";
import { decideHumanReview, type ReviewDecisionInput } from "./reviewDecision";

const base: ReviewDecisionInput = {
  identityConfidence: 0.75,
  conflictCount: 0,
  safety: { hardBlock: false, softReview: false },
  evidence: { missingRequired: [] },
  dataRisk: { needsReview: false },
  expectedConfidenceAfterReview: 0.95,
  estimatedRouteValueCents: 2000,
  riskPenaltyAvoidedCents: 0,
  orderHumanBudgetCents: 1000,
  quotedCostCents: 300,
};

describe("decideHumanReview", () => {
  it("never requires review on a hard safety block", () => {
    const result = decideHumanReview({ ...base, safety: { hardBlock: true, softReview: false } });
    expect(result).toEqual({
      required: false,
      participantCount: 0,
      reasonCodes: ["HARD_SAFETY_BLOCK"],
      maximumCostCents: 0,
    });
  });

  it("never requires review while evidence is missing", () => {
    const result = decideHumanReview({ ...base, evidence: { missingRequired: ["label"] } });
    expect(result.reasonCodes).toEqual(["ASK_SELLER_FIRST"]);
  });

  it("skips review when confidence is already high with no conflicts", () => {
    const result = decideHumanReview({ ...base, identityConfidence: 0.9 });
    expect(result.reasonCodes).toEqual(["ENOUGH_EVIDENCE"]);
    expect(result.required).toBe(false);
  });

  it("requires review when the expected benefit covers the quoted cost within budget", () => {
    const result = decideHumanReview(base);
    expect(result.required).toBe(true);
    expect(result.participantCount).toBe(3);
  });

  it("uses five participants when a soft safety flag is present", () => {
    const result = decideHumanReview({ ...base, safety: { hardBlock: false, softReview: true } });
    expect(result.required).toBe(true);
    expect(result.participantCount).toBe(5);
  });

  it("declines review when the order has no budget", () => {
    const result = decideHumanReview({ ...base, orderHumanBudgetCents: 0 });
    expect(result.required).toBe(false);
    expect(result.reasonCodes).toEqual(["REVIEW_COST_TOO_HIGH"]);
  });
});
