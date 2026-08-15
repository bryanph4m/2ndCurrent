import { describe, expect, it } from "vitest";
import { mergeImageObservations } from "./merge";
import { evaluateEvidenceCompleteness } from "./evidence";
import { makeObservation } from "./testFixtures";

describe("evaluateEvidenceCompleteness", () => {
  it("requires full_item, connector, and label for a power adapter", () => {
    const merged = mergeImageObservations([makeObservation({ missingViews: ["label"] })]);
    const result = evaluateEvidenceCompleteness(merged, "power_adapter", 0);
    expect(result.missingRequired).toEqual(["label"]);
    expect(result.canRequestMore).toBe(true);
  });

  it("is satisfied when nothing required is missing", () => {
    const merged = mergeImageObservations([makeObservation({ missingViews: [] })]);
    const result = evaluateEvidenceCompleteness(merged, "power_adapter", 0);
    expect(result.missingRequired).toEqual([]);
  });

  it("accepts connector OR label for headphones", () => {
    const merged = mergeImageObservations([makeObservation({ missingViews: ["connector"] })]);
    const result = evaluateEvidenceCompleteness(merged, "headphones", 0);
    expect(result.missingRequired).toEqual([]);
  });

  it("stops offering more requests after the two-request limit", () => {
    const merged = mergeImageObservations([makeObservation({ missingViews: ["label"] })]);
    const result = evaluateEvidenceCompleteness(merged, "power_adapter", 2);
    expect(result.canRequestMore).toBe(false);
  });

  it("falls back to the strictest evidence set for an unclassifiable item", () => {
    const merged = mergeImageObservations([makeObservation({ missingViews: ["connector"] })]);
    const result = evaluateEvidenceCompleteness(merged, "unknown", 0);
    expect(result.missingRequired).toEqual(["connector"]);
  });
});
