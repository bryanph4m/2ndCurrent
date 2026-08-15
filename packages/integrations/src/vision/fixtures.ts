import type { ImageObservation } from "@secondcurrent/domain";

// Shared between fixture.test.ts and flow.test.ts so both exercise the same
// fixture data instead of two copies drifting apart.
export const FIXTURE_LABEL_SHA256 =
  "809d54f0fda7b2e26fb742ee98dc710837bd26d8597421227224c5adaf4a7949";

export const fixtureLabelObservation: ImageObservation = {
  imageRole: "label",
  observedText: ["Dell", "65W", "USB-C"],
  itemCandidates: [
    {
      brand: "Dell",
      model: null,
      category: "laptop_power_adapter",
      connector: "usb_c",
      confidence: 0.7,
      evidence: ["Dell logo visible", "65W printed on label"],
    },
  ],
  power: { volts: 20, amps: 3.25, watts: 65, polarity: null, sourceText: "20V 3.25A 65W" },
  condition: { grade: "B", observations: ["Light scuffing on housing"] },
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
  missingViews: ["connector"],
  uncertaintyNotes: ["Connector not clearly visible in this photo"],
};
