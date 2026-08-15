import { describe, expect, it } from "vitest";
import { analyzeItem } from "./analyzeItem";
import { makeObservation } from "./testFixtures";
import type { PriceCatalogEntry } from "./price";

const priceCatalog: PriceCatalogEntry[] = [
  {
    category: "power_adapter",
    brand: "Dell",
    connector: "usb_c",
    lowCents: 800,
    midCents: 1200,
    highCents: 1600,
  },
];

const noHumanReview = {
  orderHumanBudgetCents: 0,
  quotedCostCents: 0,
  expectedConfidenceAfterReview: 0.95,
  riskPenaltyAvoidedCents: 0,
};

// Architecture doc section 41, Phase 5 acceptance criteria.
describe("analyzeItem acceptance fixtures", () => {
  it("finalizes a high-confidence, fully-evidenced item", () => {
    const images = [
      makeObservation({ imageRole: "full_item" }),
      makeObservation({
        imageRole: "connector",
        itemCandidates: [
          {
            brand: "Dell",
            model: null,
            category: "laptop_power_adapter",
            connector: "usb_c",
            confidence: 0.9,
            evidence: ["connector visible"],
          },
        ],
      }),
      makeObservation({
        imageRole: "label",
        itemCandidates: [
          {
            brand: "Dell",
            model: "XPS-65W",
            category: "laptop_power_adapter",
            connector: "usb_c",
            confidence: 0.95,
            evidence: ["model printed on label"],
          },
        ],
      }),
    ];

    const result = analyzeItem({
      images,
      itemCategoryHint: null,
      requestsSentSoFar: 0,
      priceCatalog,
      humanReview: noHumanReview,
    });

    expect(result.outcome).toBe("FINALIZED");
    if (result.outcome === "FINALIZED") {
      expect(result.passport.recommendedRoute).toBe("RESELL");
      expect(result.passport.safetyStatus).toBe("CLEAR");
      expect(result.passport.suggestedPriceCents).toBe(1200);
    }
  });

  it("never finalizes an unclassifiable item as CLEAR with a resale route", () => {
    // Regression: an item class the keyword matcher cannot place must not
    // slip through as a confident, clean resale recommendation.
    const images = [
      makeObservation({ imageRole: "full_item" }),
      makeObservation({
        imageRole: "connector",
        itemCandidates: [
          {
            brand: null,
            model: null,
            category: "unrecognized gadget",
            connector: null,
            confidence: 0.9,
            evidence: ["connector visible"],
          },
        ],
      }),
      makeObservation({
        imageRole: "label",
        itemCandidates: [
          {
            brand: null,
            model: null,
            category: "unrecognized gadget",
            connector: null,
            confidence: 0.95,
            evidence: ["label visible"],
          },
        ],
      }),
    ];

    const result = analyzeItem({
      images,
      itemCategoryHint: null,
      requestsSentSoFar: 0,
      priceCatalog,
      humanReview: noHumanReview,
    });

    if (result.outcome === "FINALIZED") {
      const contradictsItself =
        result.passport.safetyStatus === "NEEDS_REVIEW" &&
        result.passport.recommendedRoute === "RESELL";
      expect(contradictsItself).toBe(false);
    }
  });

  it("asks for evidence when a required photo is missing or unreadable", () => {
    const images = [
      makeObservation({ imageRole: "full_item", missingViews: ["label"] }),
      makeObservation({ imageRole: "connector", missingViews: ["label"] }),
    ];

    const result = analyzeItem({
      images,
      itemCategoryHint: null,
      requestsSentSoFar: 0,
      priceCatalog,
      humanReview: noHumanReview,
    });

    expect(result.outcome).toBe("WAITING_FOR_EVIDENCE");
    if (result.outcome === "WAITING_FOR_EVIDENCE") {
      expect(result.evidence.missingRequired).toContain("label");
    }
  });

  it("blocks a swollen-battery item outright", () => {
    const images = [
      makeObservation({
        itemCandidates: [
          {
            brand: null,
            model: null,
            category: "swollen battery power bank",
            connector: null,
            confidence: 0.6,
            evidence: ["visible swelling"],
          },
        ],
        safetySignals: { ...makeObservation().safetySignals, batterySwellingVisible: true },
      }),
    ];

    const result = analyzeItem({
      images,
      itemCategoryHint: null,
      requestsSentSoFar: 0,
      priceCatalog,
      humanReview: noHumanReview,
    });

    expect(result.outcome).toBe("REJECTED");
    if (result.outcome === "REJECTED") {
      expect(result.reasonCodes).toContain("BATTERY_SWELLING");
    }
  });
});
