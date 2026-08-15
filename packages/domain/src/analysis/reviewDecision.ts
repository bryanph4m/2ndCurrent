// The confidence a completed human review is projected to produce. Used two
// places: as decideHumanReview's expectedConfidenceAfterReview input (the
// buy decision - is review worth its cost), and, once review actually
// completes and reviewers agree, as the realized identityConfidence applied
// to the passport (see applyReviewOutcome in ../review/applyReviewOutcome).
// Kept as one constant so the projected and realized values can never drift
// apart.
export const EXPECTED_CONFIDENCE_AFTER_REVIEW = 0.9;

export type ReviewDecisionInput = {
  identityConfidence: number;
  conflictCount: number;
  safety: { hardBlock: boolean; softReview: boolean };
  evidence: { missingRequired: unknown[] };
  dataRisk: { needsReview: boolean };
  expectedConfidenceAfterReview: number;
  estimatedRouteValueCents: number;
  riskPenaltyAvoidedCents: number;
  orderHumanBudgetCents: number;
  quotedCostCents: number;
};

export type ReviewDecision = {
  required: boolean;
  participantCount: number;
  reasonCodes: string[];
  maximumCostCents: number;
};

// Section 21.2, verbatim.
export function decideHumanReview(input: ReviewDecisionInput): ReviewDecision {
  if (input.safety.hardBlock) {
    return {
      required: false,
      participantCount: 0,
      reasonCodes: ["HARD_SAFETY_BLOCK"],
      maximumCostCents: 0,
    };
  }

  if (input.evidence.missingRequired.length > 0) {
    return {
      required: false,
      participantCount: 0,
      reasonCodes: ["ASK_SELLER_FIRST"],
      maximumCostCents: 0,
    };
  }

  if (
    input.identityConfidence >= 0.88 &&
    input.conflictCount === 0 &&
    !input.safety.softReview &&
    !input.dataRisk.needsReview
  ) {
    return {
      required: false,
      participantCount: 0,
      reasonCodes: ["ENOUGH_EVIDENCE"],
      maximumCostCents: 0,
    };
  }

  const expectedBenefitCents =
    Math.round(
      (input.expectedConfidenceAfterReview - input.identityConfidence) *
        input.estimatedRouteValueCents,
    ) + input.riskPenaltyAvoidedCents;

  const maximumCostCents = Math.min(
    input.orderHumanBudgetCents,
    Math.floor(expectedBenefitCents / 1.25),
  );

  const reviewIsWorthIt = input.quotedCostCents <= maximumCostCents && maximumCostCents > 0;

  return {
    required: reviewIsWorthIt,
    participantCount: input.safety.softReview ? 5 : 3,
    reasonCodes: reviewIsWorthIt
      ? ["LOW_CONFIDENCE", "POSITIVE_VALUE_OF_REVIEW"]
      : ["REVIEW_COST_TOO_HIGH"],
    maximumCostCents,
  };
}
