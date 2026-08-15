import { describe, expect, it } from "vitest";
import { PRODUCT_CHANGE_CATALOG, assignBlindComparisonOrder, calculateStudyMetrics } from "./study";

describe("measurement study", () => {
  it("calculates before and after metrics with raw counts", () => {
    const metrics = calculateStudyMetrics([
      {
        identityCorrect: true,
        trustRating: 5,
        purchaseIntentRating: 4,
        routeAgrees: true,
        missingEvidence: false,
        preferredVariant: "REVISED",
        timeSeconds: 30,
      },
      {
        identityCorrect: false,
        trustRating: 7,
        purchaseIntentRating: 6,
        routeAgrees: true,
        missingEvidence: true,
        preferredVariant: "BASELINE",
        timeSeconds: 50,
      },
      {
        identityCorrect: true,
        trustRating: 6,
        purchaseIntentRating: 5,
        routeAgrees: false,
        missingEvidence: false,
        preferredVariant: "REVISED",
        timeSeconds: 40,
      },
    ]);

    expect(metrics).toMatchObject({
      sampleSize: 3,
      identityAccuracy: 2 / 3,
      trustMedian: 6,
      purchaseIntentMedian: 5,
      routeAgreement: 2 / 3,
      missingEvidenceRate: 1 / 3,
      preferenceRate: 2 / 3,
      medianTimeSeconds: 40,
      rawCounts: {
        identityCorrect: 2,
        identityTotal: 3,
        revisedPreferred: 2,
        preferenceTotal: 3,
      },
    });
  });

  it("randomizes which passport appears first", () => {
    expect(assignBlindComparisonOrder(0.25)).toEqual(["BASELINE", "REVISED"]);
    expect(assignBlindComparisonOrder(0.75)).toEqual(["REVISED", "BASELINE"]);
  });

  it("limits product changes to the bounded catalog", () => {
    expect(PRODUCT_CHANGE_CATALOG).toContain("REQUIRE_CONNECTOR_CLOSE_UP");
    expect(PRODUCT_CHANGE_CATALOG).toContain("ADD_CLEARER_NEXT_STEP_REASON");
  });
});
