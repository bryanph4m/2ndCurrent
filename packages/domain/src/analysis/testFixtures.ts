import type { ImageObservation } from "../schemas/imageObservation";

// Shared observation builder for analysis unit tests (merge, safety,
// evidence, analyzeItem). Not exported from the package index - test-only.
export function makeObservation(overrides: Partial<ImageObservation> = {}): ImageObservation {
  return {
    imageRole: "full_item",
    observedText: [],
    itemCandidates: [
      {
        brand: "Dell",
        model: null,
        category: "laptop_power_adapter",
        connector: "usb_c",
        confidence: 0.9,
        evidence: ["Dell logo visible"],
      },
    ],
    power: { volts: 20, amps: 3.25, watts: 65, polarity: null, sourceText: "20V 3.25A 65W" },
    condition: { grade: "B", observations: [] },
    safetySignals: {
      batteryVisible: false,
      batterySwellingVisible: false,
      exposedWireVisible: false,
      burnMarkVisible: false,
      crackedMainsHousingVisible: false,
      liquidDamageVisible: false,
      unknownPowerLabel: false,
      notes: [],
    },
    dataRisk: {
      likelyDataBearing: false,
      screenShowsPersonalData: false,
      activationLockRisk: false,
      notes: [],
    },
    missingViews: [],
    uncertaintyNotes: [],
    ...overrides,
  };
}
