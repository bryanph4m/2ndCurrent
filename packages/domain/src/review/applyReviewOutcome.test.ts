import { describe, expect, it } from "vitest";
import { applyReviewOutcome } from "./applyReviewOutcome";
import type { PassportFields } from "../analysis/passport";
import type { StudyResponseAnswers } from "../schemas/studyResponse";
import type { PriceCatalogEntry } from "../analysis/price";

const draftPassport: PassportFields = {
  title: "Dell power adapter",
  brand: "Dell",
  model: null,
  category: "power_adapter",
  connector: "usb_c",
  powerText: "20V 3.25A 65W",
  conditionGrade: "B",
  identityConfidence: 0.75,
  safetyStatus: "NEEDS_REVIEW",
  dataRisk: "CLEAR",
  recommendedRoute: "DONATE",
  suggestedPriceCents: null,
  knownFacts: ["The brand is Dell."],
  unknownFacts: ["The model is not confirmed."],
  disclaimer: "This item record is based on photos and reported evidence.",
};

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

function answer(overrides: Partial<StudyResponseAnswers> = {}): StudyResponseAnswers {
  return {
    connectorChoice: "usb_c",
    labelReadable: true,
    identityCandidate: "Dell",
    conditionAgreement: 6,
    missingEvidence: [],
    safetyConcern: false,
    ...overrides,
  };
}

// Architecture doc section 41 Phase 7 acceptance: "Mock three-person review
// finalizes the ambiguous charger."
describe("applyReviewOutcome", () => {
  it("finalizes the ambiguous charger when three reviewers agree", () => {
    const outcome = applyReviewOutcome({
      draftPassport,
      itemClass: "power_adapter",
      answers: [answer(), answer(), answer({ conditionAgreement: 7 })],
      priceCatalog,
    });

    expect(outcome.blocked).toBe(false);
    expect(outcome.passport.identityConfidence).toBeGreaterThanOrEqual(0.9);
    expect(outcome.passport.safetyStatus).toBe("CLEAR");
    expect(outcome.passport.recommendedRoute).toBe("RESELL");
    expect(outcome.passport.suggestedPriceCents).toBe(1200);
  });

  it("does not raise confidence when reviewers disagree on connector", () => {
    const outcome = applyReviewOutcome({
      draftPassport,
      itemClass: "power_adapter",
      answers: [
        answer({ connectorChoice: "usb_c" }),
        answer({ connectorChoice: "usb_a" }),
        answer({ connectorChoice: "lightning" }),
      ],
      priceCatalog,
    });

    expect(outcome.blocked).toBe(false);
    expect(outcome.passport.identityConfidence).toBe(draftPassport.identityConfidence);
    expect(outcome.passport.safetyStatus).toBe("NEEDS_REVIEW");
  });

  it("blocks the item when a majority of reviewers flag a safety concern", () => {
    const outcome = applyReviewOutcome({
      draftPassport,
      itemClass: "power_adapter",
      answers: [
        answer({ safetyConcern: true }),
        answer({ safetyConcern: true }),
        answer({ safetyConcern: false }),
      ],
      priceCatalog,
    });

    expect(outcome.blocked).toBe(true);
    expect(outcome.passport.safetyStatus).toBe("DO_NOT_LIST");
    expect(outcome.passport.recommendedRoute).toBe("DO_NOT_LIST");
    expect(outcome.passport.suggestedPriceCents).toBeNull();
  });

  it("never clears a hard safety flag - only adds one", () => {
    // Even with unanimous "no concern" votes, applyReviewOutcome cannot turn
    // a DO_NOT_LIST draft into something listable; a hard block never
    // reaches WAITING_FOR_REVIEW in the first place (analyzeItem.ts), so
    // this only documents the invariant, not a code path that clears one.
    const doNotListDraft: PassportFields = { ...draftPassport, safetyStatus: "DO_NOT_LIST" };
    const outcome = applyReviewOutcome({
      draftPassport: doNotListDraft,
      itemClass: "power_adapter",
      answers: [answer(), answer(), answer()],
      priceCatalog,
    });
    expect(outcome.passport.safetyStatus).not.toBe("CLEAR");
  });
});
