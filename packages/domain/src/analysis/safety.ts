import type { ImageObservation } from "../schemas/imageObservation";
import { isUnsupportedItemClass, type ItemClass } from "./itemClass";
import { conditionGradeSpread, type MergedObservation } from "./merge";

export type SafetyStatusValue = "CLEAR" | "NEEDS_REVIEW" | "DO_NOT_LIST";

export type SafetyResult = {
  status: SafetyStatusValue;
  hardBlock: boolean;
  softReview: boolean;
  reasonCodes: string[];
};

export type DataRiskResult = {
  blocking: boolean;
  needsReview: boolean;
  reasonCodes: string[];
};

// Section 19.3's hard rules. A hard block always wins over everything else,
// including an unsupported item class caught after the fact.
export function evaluateSafety(
  merged: MergedObservation,
  itemClass: ItemClass,
  observations: ImageObservation[],
): SafetyResult {
  const s = merged.safetySignals;
  const hardReasons: string[] = [];

  if (s.batterySwellingVisible) hardReasons.push("BATTERY_SWELLING");
  if (s.exposedWireVisible) hardReasons.push("EXPOSED_MAINS_CONDUCTOR");
  if (s.burnMarkVisible) hardReasons.push("BURN_MARK_NEAR_POWER_INPUT");
  if (s.crackedMainsHousingVisible) hardReasons.push("CRACKED_MAINS_HOUSING");
  if (s.liquidDamageVisible) hardReasons.push("LIQUID_DAMAGE");
  if (isUnsupportedItemClass(itemClass)) hardReasons.push("UNSUPPORTED_ITEM_CLASS");

  if (hardReasons.length > 0) {
    return { status: "DO_NOT_LIST", hardBlock: true, softReview: false, reasonCodes: hardReasons };
  }

  const softReasons: string[] = [];
  if (s.batteryVisible && merged.condition.grade === "UNKNOWN") {
    softReasons.push("BATTERY_CONDITION_UNCLEAR");
  }
  if (s.unknownPowerLabel) softReasons.push("POWER_LABEL_PARTLY_READABLE");
  if (merged.conflictCount > 0) softReasons.push("CONNECTOR_IDENTITY_CONFLICT");
  if (conditionGradeSpread(observations) > 1) softReasons.push("CONDITION_GRADE_SPREAD");
  // Section 19.3's NEEDS_REVIEW list is these four conditions, closed - an
  // unrecognized item class is not one of them. It is handled instead by
  // evaluateEvidenceCompleteness falling back to the strictest evidence set
  // for a class it cannot place, which naturally routes to
  // WAITING_FOR_EVIDENCE or NEEDS_MORE_EVIDENCE rather than a silent finalize.

  if (softReasons.length > 0) {
    return { status: "NEEDS_REVIEW", hardBlock: false, softReview: true, reasonCodes: softReasons };
  }

  return { status: "CLEAR", hardBlock: false, softReview: false, reasonCodes: [] };
}

// Section 19.3's data-risk block. Blocking means "do not list yet", not
// "recycle" - the item can still be listed once the risk clears.
export function evaluateDataRisk(merged: MergedObservation): DataRiskResult {
  const d = merged.dataRisk;
  const reasonCodes: string[] = [];
  if (d.likelyDataBearing) reasonCodes.push("LIKELY_DATA_BEARING_NO_WIPE_EVIDENCE");
  if (d.activationLockRisk) reasonCodes.push("ACTIVATION_LOCK_RISK");
  if (d.screenShowsPersonalData) reasonCodes.push("SCREEN_SHOWS_PERSONAL_DATA");

  const blocking = reasonCodes.length > 0;
  return { blocking, needsReview: blocking, reasonCodes };
}
