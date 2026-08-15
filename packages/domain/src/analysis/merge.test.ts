import { describe, expect, it } from "vitest";
import { mergeImageObservations } from "./merge";
import { makeObservation } from "./testFixtures";

describe("mergeImageObservations", () => {
  it("deduplicates OCR text after normalization", () => {
    const merged = mergeImageObservations([
      makeObservation({ observedText: ["Dell ", "65W"] }),
      makeObservation({ observedText: ["dell", "65W"] }),
    ]);
    expect(merged.observedText).toEqual(["dell", "65w"]);
  });

  it("prefers the label image for model and power, and the connector image for connector", () => {
    const merged = mergeImageObservations([
      makeObservation({
        imageRole: "full_item",
        itemCandidates: [
          {
            brand: "Dell",
            model: null,
            category: "power_adapter",
            connector: "usb_a",
            confidence: 0.5,
            evidence: [],
          },
        ],
        power: { volts: null, amps: null, watts: null, polarity: null, sourceText: null },
      }),
      makeObservation({
        imageRole: "connector",
        itemCandidates: [
          {
            brand: "Dell",
            model: null,
            category: "power_adapter",
            connector: "usb_c",
            confidence: 0.6,
            evidence: [],
          },
        ],
      }),
      makeObservation({
        imageRole: "label",
        itemCandidates: [
          {
            brand: "Dell",
            model: "XPS-65W",
            category: "power_adapter",
            connector: "usb_a",
            confidence: 0.95,
            evidence: ["model number printed on label"],
          },
        ],
        power: { volts: 20, amps: 3.25, watts: 65, polarity: null, sourceText: "20V 3.25A 65W" },
      }),
    ]);

    expect(merged.identity.model).toBe("XPS-65W");
    expect(merged.power.sourceText).toBe("20V 3.25A 65W");
    expect(merged.identity.connector).toBe("usb_c");
  });

  it("keeps a positive safety signal even if only one image reports it", () => {
    const merged = mergeImageObservations([
      makeObservation({
        safetySignals: { ...makeObservation().safetySignals, burnMarkVisible: true },
      }),
      makeObservation(),
    ]);
    expect(merged.safetySignals.burnMarkVisible).toBe(true);
  });

  it("discards a model value that has no supporting evidence", () => {
    const merged = mergeImageObservations([
      makeObservation({
        imageRole: "label",
        itemCandidates: [
          {
            brand: "Dell",
            model: "XPS-65W",
            category: "power_adapter",
            connector: "usb_c",
            confidence: 0.9,
            evidence: [],
          },
        ],
      }),
    ]);
    expect(merged.identity.model).toBeNull();
  });

  it("lowers confidence on conflicting brand candidates and never exceeds the best single-image confidence", () => {
    const merged = mergeImageObservations([
      makeObservation({
        itemCandidates: [
          {
            brand: "Dell",
            model: null,
            category: "power_adapter",
            connector: "usb_c",
            confidence: 0.9,
            evidence: ["logo"],
          },
        ],
      }),
      makeObservation({
        imageRole: "connector",
        itemCandidates: [
          {
            brand: "Anker",
            model: null,
            category: "power_adapter",
            connector: "usb_c",
            confidence: 0.4,
            evidence: ["logo"],
          },
        ],
      }),
    ]);

    expect(merged.conflictCount).toBeGreaterThan(0);
    expect(merged.identity.confidence).toBeLessThan(0.9);
    expect(merged.identity.confidence).toBeLessThanOrEqual(0.9);
  });
});
