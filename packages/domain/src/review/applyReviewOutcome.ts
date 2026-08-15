import { EXPECTED_CONFIDENCE_AFTER_REVIEW } from "../analysis/reviewDecision";
import { estimateRouteValue, type PriceCatalogEntry } from "../analysis/price";
import { decideRoute } from "../analysis/route";
import type { PassportFields } from "../analysis/passport";
import type { ItemClass } from "../analysis/itemClass";
import type { StudyResponseAnswers } from "../schemas/studyResponse";
import {
  aggregateCategorical,
  aggregateRating,
  collectFreeText,
  type CategoricalTally,
  type RatingSummary,
} from "./aggregate";

export type ReviewAggregate = {
  connector: CategoricalTally;
  identityCandidate: CategoricalTally;
  labelReadable: CategoricalTally;
  condition: RatingSummary;
  safetyConcern: CategoricalTally;
  missingEvidence: string[];
  comments: string[];
};

export type ReviewOutcome = {
  passport: PassportFields;
  blocked: boolean;
  aggregate: ReviewAggregate;
};

// Turns approved review answers (section 22.5's aggregation) into an
// adjusted passport. Section 18.3: review may raise or lower confidence but
// can never remove a hard safety flag from a photo - a hard block never
// reaches WAITING_FOR_REVIEW in the first place, so reviewers can only ever
// add a DO_NOT_LIST here, never clear one.
export function applyReviewOutcome(input: {
  draftPassport: PassportFields;
  itemClass: ItemClass;
  answers: StudyResponseAnswers[];
  priceCatalog: PriceCatalogEntry[];
}): ReviewOutcome {
  const connector = aggregateCategorical(input.answers.map((a) => a.connectorChoice));
  const identityCandidate = aggregateCategorical(input.answers.map((a) => a.identityCandidate));
  const labelReadable = aggregateCategorical(input.answers.map((a) => String(a.labelReadable)));
  const condition = aggregateRating(input.answers.map((a) => a.conditionAgreement));
  const safetyConcern = aggregateCategorical(input.answers.map((a) => String(a.safetyConcern)));
  const missingEvidence = [...new Set(input.answers.flatMap((a) => a.missingEvidence))];
  const comments = collectFreeText(input.answers.map((a) => a.comment ?? ""));

  const aggregate: ReviewAggregate = {
    connector,
    identityCandidate,
    labelReadable,
    condition,
    safetyConcern,
    missingEvidence,
    comments,
  };

  // Section 18.3: review can never remove a hard safety flag. In practice a
  // hard block never reaches WAITING_FOR_REVIEW (analyzeItem.ts), so
  // draftPassport.safetyStatus is CLEAR or NEEDS_REVIEW - this guard is
  // defense in depth, not a reachable path.
  const reviewersFlagSafety =
    input.draftPassport.safetyStatus === "DO_NOT_LIST" ||
    (safetyConcern.winner === "true" && !safetyConcern.tie);
  if (reviewersFlagSafety) {
    return {
      passport: {
        ...input.draftPassport,
        safetyStatus: "DO_NOT_LIST",
        recommendedRoute: "DO_NOT_LIST",
        suggestedPriceCents: null,
      },
      blocked: true,
      aggregate,
    };
  }

  // "Reviewers agree" requires no tie on any categorical question and a
  // condition rating of at least 5 of 7 - a judgment call (the doc gives the
  // aggregation math but not a pass/fail threshold), chosen to require
  // agreement on every question rather than any single one.
  const reviewersAgree =
    !connector.tie && !labelReadable.tie && !identityCandidate.tie && condition.median >= 5;

  const identityConfidence = reviewersAgree
    ? Math.max(input.draftPassport.identityConfidence, EXPECTED_CONFIDENCE_AFTER_REVIEW)
    : input.draftPassport.identityConfidence;

  const price = estimateRouteValue(
    {
      itemClass: input.itemClass,
      brand: input.draftPassport.brand,
      connector: input.draftPassport.connector,
      conditionGrade: input.draftPassport.conditionGrade,
      identityConfidence,
    },
    input.priceCatalog,
  );

  const route = decideRoute({
    safety: { status: "CLEAR", hardBlock: false, softReview: !reviewersAgree, reasonCodes: [] },
    dataRisk: { blocking: false, needsReview: false, reasonCodes: [] },
    evidence: { missingRequired: [], canRequestMore: false, requestNumber: 1 },
    price,
    conditionGrade: input.draftPassport.conditionGrade,
    identityConfidence,
  });

  return {
    passport: {
      ...input.draftPassport,
      identityConfidence,
      suggestedPriceCents: price?.quotedCents ?? null,
      recommendedRoute: route.route,
      safetyStatus: reviewersAgree ? "CLEAR" : "NEEDS_REVIEW",
    },
    blocked: false,
    aggregate,
  };
}
