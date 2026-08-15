import { z } from "zod";

export const PRODUCT_CHANGE_CATALOG = [
  "REQUIRE_CONNECTOR_CLOSE_UP",
  "REQUIRE_LABEL_CLOSE_UP",
  "REQUIRE_FULL_ITEM_PHOTO",
  "ADD_CONDITION_GRADE_DEFINITIONS",
  "ADD_UNKNOWN_FACTS_SECTION",
  "ADD_DATA_RISK_NOTICE",
  "ADD_EVIDENCE_CAPTURE_DATE",
  "RAISE_IDENTITY_CONFIDENCE_THRESHOLD",
  "INCREASE_REVIEW_COUNT_ON_CONFLICT",
  "STOP_PRICING_LOW_CONFIDENCE_ITEMS",
  "CHANGE_RESALE_THRESHOLD",
  "ADD_CLEARER_NEXT_STEP_REASON",
] as const;

export const ProductChangeCodeSchema = z.enum(PRODUCT_CHANGE_CATALOG);
export type ProductChangeCode = z.infer<typeof ProductChangeCodeSchema>;

export const MeasurementResponseSchema = z.object({
  identityCorrect: z.boolean(),
  trustRating: z.number().int().min(1).max(7),
  purchaseIntentRating: z.number().int().min(1).max(7),
  routeAgrees: z.boolean(),
  missingEvidence: z.boolean(),
  preferredVariant: z.enum(["BASELINE", "REVISED"]).nullable().optional(),
  timeSeconds: z.number().nonnegative().optional(),
});

export type MeasurementResponse = z.infer<typeof MeasurementResponseSchema>;

export type StudyMetricCounts = {
  identityCorrect: number;
  identityTotal: number;
  routeAgreed: number;
  routeTotal: number;
  missingEvidenceComplaints: number;
  missingEvidenceTotal: number;
  revisedPreferred: number;
  preferenceTotal: number;
};

export type StudyMetrics = {
  sampleSize: number;
  identityAccuracy: number;
  trustMedian: number;
  purchaseIntentMedian: number;
  routeAgreement: number;
  missingEvidenceRate: number;
  preferenceRate?: number;
  medianTimeSeconds?: number;
  rawCounts: StudyMetricCounts;
};

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint]!;
  return (sorted[midpoint - 1]! + sorted[midpoint]!) / 2;
}

export function calculateStudyMetrics(inputs: readonly unknown[]): StudyMetrics {
  const responses = inputs.map((input) => MeasurementResponseSchema.parse(input));
  const preferenceResponses = responses.filter(
    (response) => response.preferredVariant !== undefined && response.preferredVariant !== null,
  );
  const timedResponses = responses.flatMap((response) =>
    response.timeSeconds === undefined ? [] : [response.timeSeconds],
  );
  const rawCounts: StudyMetricCounts = {
    identityCorrect: responses.filter((response) => response.identityCorrect).length,
    identityTotal: responses.length,
    routeAgreed: responses.filter((response) => response.routeAgrees).length,
    routeTotal: responses.length,
    missingEvidenceComplaints: responses.filter((response) => response.missingEvidence).length,
    missingEvidenceTotal: responses.length,
    revisedPreferred: preferenceResponses.filter(
      (response) => response.preferredVariant === "REVISED",
    ).length,
    preferenceTotal: preferenceResponses.length,
  };

  return {
    sampleSize: responses.length,
    identityAccuracy: rate(rawCounts.identityCorrect, rawCounts.identityTotal),
    trustMedian: median(responses.map((response) => response.trustRating)),
    purchaseIntentMedian: median(responses.map((response) => response.purchaseIntentRating)),
    routeAgreement: rate(rawCounts.routeAgreed, rawCounts.routeTotal),
    missingEvidenceRate: rate(rawCounts.missingEvidenceComplaints, rawCounts.missingEvidenceTotal),
    ...(rawCounts.preferenceTotal > 0
      ? { preferenceRate: rate(rawCounts.revisedPreferred, rawCounts.preferenceTotal) }
      : {}),
    ...(timedResponses.length > 0 ? { medianTimeSeconds: median(timedResponses) } : {}),
    rawCounts,
  };
}

export function assignBlindComparisonOrder(randomValue = Math.random()): readonly [string, string] {
  if (randomValue < 0 || randomValue > 1) {
    throw new RangeError("randomValue must be between 0 and 1");
  }
  return randomValue < 0.5 ? ["BASELINE", "REVISED"] : ["REVISED", "BASELINE"];
}
