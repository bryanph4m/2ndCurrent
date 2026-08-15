import type { SafetyResult, DataRiskResult } from "./safety";
import type { EvidenceResult } from "./evidence";
import type { PriceEstimate } from "./price";

export type ConditionGrade = "A" | "B" | "C" | "D" | "UNKNOWN";

export type DispositionRoute =
  "RESELL" | "DONATE" | "REPAIR" | "RECYCLE" | "NEEDS_MORE_EVIDENCE" | "DO_NOT_LIST";

export type RouteDecision = { route: DispositionRoute; reason: string };

const RESALE_THRESHOLD_CENTS = 500;

// Section 25.4. REPAIR is not selected automatically: it requires "a known
// repair path", and there is no repair-path data source in this iteration.
// Skipped: repair-path catalog. Add when a repair-service integration exists.
export function decideRoute(input: {
  safety: SafetyResult;
  dataRisk: DataRiskResult;
  evidence: EvidenceResult;
  price: PriceEstimate | null;
  conditionGrade: ConditionGrade;
  identityConfidence: number;
}): RouteDecision {
  if (input.safety.hardBlock) {
    return { route: "DO_NOT_LIST", reason: "A hard safety rule matched this item." };
  }
  if (input.dataRisk.blocking) {
    return { route: "DO_NOT_LIST", reason: "This item may still hold personal data." };
  }
  if (input.evidence.missingRequired.length > 0) {
    return { route: "NEEDS_MORE_EVIDENCE", reason: "Required photos are still missing." };
  }

  const confidenceOk = input.identityConfidence >= 0.7;

  if (confidenceOk && input.price && input.price.quotedCents >= RESALE_THRESHOLD_CENTS) {
    return { route: "RESELL", reason: "This item is identified, safe, and worth resale value." };
  }
  if (input.conditionGrade === "D") {
    return {
      route: "RECYCLE",
      reason: "The item shows major damage and is not economical to reuse.",
    };
  }
  if (confidenceOk) {
    return { route: "DONATE", reason: "This item appears usable but has low resale value." };
  }
  return { route: "RECYCLE", reason: "Identity is not confident enough to resell or donate." };
}
