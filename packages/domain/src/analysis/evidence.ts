import type { ItemClass, SupportedItemClass } from "./itemClass";
import type { MergedObservation } from "./merge";

type ViewLabel = "full_item" | "connector" | "label";

export type EvidenceResult = {
  missingRequired: ViewLabel[];
  canRequestMore: boolean;
  requestNumber: number;
};

const MAX_EVIDENCE_REQUESTS = 2;

// Section 20's table. Each entry is an AND of OR-groups: a group is missing
// only if every view in it is missing. Headphones/speakers accept a connector
// OR a model label, matching the table's "connector or model label" column.
const REQUIRED_VIEWS: Record<SupportedItemClass, ViewLabel[][]> = {
  cable: [["full_item"], ["connector"]],
  power_adapter: [["full_item"], ["connector"], ["label"]],
  mouse: [["full_item"], ["label"]],
  keyboard: [["full_item"], ["label"]],
  usb_hub: [["full_item"], ["connector"], ["label"]],
  headphones: [["full_item"], ["connector", "label"]],
  speaker: [["full_item"], ["connector", "label"]],
};

// An item the model could not classify gets the strictest common
// requirement set, not the loosest - an unclassifiable item should fail
// closed into WAITING_FOR_EVIDENCE, not take the fastest path to a passport.
const FALLBACK_REQUIRED_VIEWS: ViewLabel[][] = [["full_item"], ["connector"], ["label"]];

export function evaluateEvidenceCompleteness(
  merged: MergedObservation,
  itemClass: ItemClass,
  requestsSentSoFar: number,
): EvidenceResult {
  const groups = REQUIRED_VIEWS[itemClass as SupportedItemClass] ?? FALLBACK_REQUIRED_VIEWS;
  const missingRequired = groups
    .filter((group) => group.every((view) => merged.missingViews.has(view)))
    .map((group) => group[0]!);

  return {
    missingRequired,
    canRequestMore: missingRequired.length > 0 && requestsSentSoFar < MAX_EVIDENCE_REQUESTS,
    requestNumber: requestsSentSoFar + 1,
  };
}
