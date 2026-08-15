import { describe, expect, it } from "vitest";
import { mergeImageObservations } from "./merge";
import { evaluateDataRisk, evaluateSafety } from "./safety";
import { makeObservation } from "./testFixtures";

describe("evaluateSafety", () => {
  it("blocks on visible battery swelling regardless of item class", () => {
    const observations = [
      makeObservation({
        safetySignals: { ...makeObservation().safetySignals, batterySwellingVisible: true },
      }),
    ];
    const merged = mergeImageObservations(observations);
    const result = evaluateSafety(merged, "power_adapter", observations);
    expect(result.status).toBe("DO_NOT_LIST");
    expect(result.hardBlock).toBe(true);
    expect(result.reasonCodes).toContain("BATTERY_SWELLING");
  });

  it("blocks an unsupported item class even with no other signals", () => {
    const observations = [makeObservation()];
    const merged = mergeImageObservations(observations);
    const result = evaluateSafety(merged, "swollen_battery_device", observations);
    expect(result.status).toBe("DO_NOT_LIST");
  });

  it("flags NEEDS_REVIEW when condition grade spreads by more than one grade across views", () => {
    const observations = [
      makeObservation({ condition: { grade: "A", observations: [] } }),
      makeObservation({ condition: { grade: "D", observations: [] } }),
    ];
    const merged = mergeImageObservations(observations);
    const result = evaluateSafety(merged, "power_adapter", observations);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.reasonCodes).toContain("CONDITION_GRADE_SPREAD");
  });

  it("is CLEAR when nothing is flagged", () => {
    const observations = [makeObservation()];
    const merged = mergeImageObservations(observations);
    const result = evaluateSafety(merged, "power_adapter", observations);
    expect(result.status).toBe("CLEAR");
  });
});

describe("evaluateDataRisk", () => {
  it("blocks when the device is likely data-bearing", () => {
    const merged = mergeImageObservations([
      makeObservation({ dataRisk: { ...makeObservation().dataRisk, likelyDataBearing: true } }),
    ]);
    const result = evaluateDataRisk(merged);
    expect(result.blocking).toBe(true);
    expect(result.reasonCodes).toContain("LIKELY_DATA_BEARING_NO_WIPE_EVIDENCE");
  });

  it("is not blocking when no data risk signal is present", () => {
    const merged = mergeImageObservations([makeObservation()]);
    expect(evaluateDataRisk(merged).blocking).toBe(false);
  });
});
