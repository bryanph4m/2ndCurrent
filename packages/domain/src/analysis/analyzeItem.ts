import type { ImageObservation } from "../schemas/imageObservation";
import { mergeImageObservations, type MergedObservation } from "./merge";
import { evaluateSafety, evaluateDataRisk } from "./safety";
import { evaluateEvidenceCompleteness, type EvidenceResult } from "./evidence";
import { decideHumanReview, type ReviewDecision } from "./reviewDecision";
import { estimateRouteValue, type PriceCatalogEntry } from "./price";
import { decideRoute } from "./route";
import { normalizeItemClass } from "./itemClass";
import { buildPassportFields, type PassportFields } from "./passport";

export type AnalyzeItemInput = {
  images: ImageObservation[];
  itemCategoryHint: string | null;
  requestsSentSoFar: number;
  priceCatalog: PriceCatalogEntry[];
  humanReview: {
    orderHumanBudgetCents: number;
    quotedCostCents: number;
    expectedConfidenceAfterReview: number;
    riskPenaltyAvoidedCents: number;
  };
};

export type AnalyzeItemResult =
  | { outcome: "REJECTED"; merged: MergedObservation; reasonCodes: string[] }
  | { outcome: "WAITING_FOR_EVIDENCE"; merged: MergedObservation; evidence: EvidenceResult }
  | {
      outcome: "WAITING_FOR_REVIEW";
      merged: MergedObservation;
      review: ReviewDecision;
      draftPassport: PassportFields;
    }
  | { outcome: "FINALIZED"; merged: MergedObservation; passport: PassportFields };

// This is the pure core of section 17.2's analyzeItem: everything except the
// AnalysisRun claim, DB writes, and taskRunner calls, which belong to
// packages/db (analyzeItemFlow.ts) since domain code stays DB-free.
export function analyzeItem(input: AnalyzeItemInput): AnalyzeItemResult {
  const merged = mergeImageObservations(input.images);
  const itemClass = normalizeItemClass(merged.identity.category ?? input.itemCategoryHint);
  const safety = evaluateSafety(merged, itemClass, input.images);

  if (safety.hardBlock) {
    return { outcome: "REJECTED", merged, reasonCodes: safety.reasonCodes };
  }

  const dataRisk = evaluateDataRisk(merged);
  const evidence = evaluateEvidenceCompleteness(merged, itemClass, input.requestsSentSoFar);
  if (evidence.missingRequired.length > 0) {
    return { outcome: "WAITING_FOR_EVIDENCE", merged, evidence };
  }

  const price = estimateRouteValue(
    {
      itemClass,
      brand: merged.identity.brand,
      connector: merged.identity.connector,
      conditionGrade: merged.condition.grade,
      identityConfidence: merged.identity.confidence,
    },
    input.priceCatalog,
  );

  const review = decideHumanReview({
    identityConfidence: merged.identity.confidence,
    conflictCount: merged.conflictCount,
    safety,
    evidence,
    dataRisk,
    expectedConfidenceAfterReview: input.humanReview.expectedConfidenceAfterReview,
    estimatedRouteValueCents: price?.quotedCents ?? 0,
    riskPenaltyAvoidedCents: input.humanReview.riskPenaltyAvoidedCents,
    orderHumanBudgetCents: input.humanReview.orderHumanBudgetCents,
    quotedCostCents: input.humanReview.quotedCostCents,
  });

  // Computed before the review check since both branches need it: a
  // finalized item needs its real route, and a review-pending item needs a
  // draft passport (pre-review confidence/route/price) so Phase 7 can
  // rebuild the finalized one from stored data once review completes,
  // without re-running vision analysis.
  const route = decideRoute({
    safety,
    dataRisk,
    evidence,
    price,
    conditionGrade: merged.condition.grade,
    identityConfidence: merged.identity.confidence,
  });

  if (review.required) {
    const draftPassport = buildPassportFields({
      merged,
      itemClass,
      safety,
      dataRisk,
      price,
      route,
    });
    return { outcome: "WAITING_FOR_REVIEW", merged, review, draftPassport };
  }

  const passport = buildPassportFields({ merged, itemClass, safety, dataRisk, price, route });
  return { outcome: "FINALIZED", merged, passport };
}
