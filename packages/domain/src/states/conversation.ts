import { assertTransition } from "../services/transitions";

export type ConversationState =
  | "NEW"
  | "WAITING_FOR_CONSENT"
  | "WAITING_FOR_PHOTOS"
  | "WAITING_FOR_PAYMENT"
  | "ORDER_PAID"
  | "ANALYZING"
  | "WAITING_FOR_MORE_EVIDENCE"
  | "WAITING_FOR_HUMAN_REVIEW"
  | "RESULT_READY"
  | "DELIVERED"
  | "CLOSED"
  | "OPTED_OUT"
  | "BLOCKED"
  | "ERROR";

const GLOBAL_EXITS: ConversationState[] = ["OPTED_OUT", "BLOCKED", "ERROR"];

// Architecture doc section 11.1 gives this as a single linear arrow chain, but
// the narrative flows (12.5 evidence loop, 12.8 finalize, 34.3 Flow A skipping
// evidence/review) require branches a strict chain cannot express. This map
// encodes the flows, not the literal chain: ANALYZING can go straight to
// RESULT_READY (Flow A), branch to evidence or review, and evidence loops back
// to ANALYZING once resupplied. NEW can also go straight to WAITING_FOR_PHOTOS:
// Phase 3 sends consent notice and photo instructions as one combined text
// (section 12.1's own example message does this) rather than gating on a
// separate YES reply, so there is no state where the conversation waits on
// consent alone yet. WAITING_FOR_CONSENT remains reachable for when that gate
// is built out.
export const CONVERSATION_TRANSITIONS: Record<ConversationState, readonly ConversationState[]> = {
  NEW: ["WAITING_FOR_CONSENT", "WAITING_FOR_PHOTOS", ...GLOBAL_EXITS],
  WAITING_FOR_CONSENT: ["WAITING_FOR_PHOTOS", ...GLOBAL_EXITS],
  WAITING_FOR_PHOTOS: ["WAITING_FOR_PAYMENT", ...GLOBAL_EXITS],
  WAITING_FOR_PAYMENT: ["ORDER_PAID", ...GLOBAL_EXITS],
  ORDER_PAID: ["ANALYZING", ...GLOBAL_EXITS],
  ANALYZING: [
    "WAITING_FOR_MORE_EVIDENCE",
    "WAITING_FOR_HUMAN_REVIEW",
    "RESULT_READY",
    ...GLOBAL_EXITS,
  ],
  WAITING_FOR_MORE_EVIDENCE: ["ANALYZING", ...GLOBAL_EXITS],
  WAITING_FOR_HUMAN_REVIEW: ["RESULT_READY", ...GLOBAL_EXITS],
  RESULT_READY: ["DELIVERED", ...GLOBAL_EXITS],
  DELIVERED: ["CLOSED", ...GLOBAL_EXITS],
  CLOSED: [],
  OPTED_OUT: [],
  BLOCKED: [],
  ERROR: [],
};

export function assertConversationTransition(from: ConversationState, to: ConversationState): void {
  assertTransition("Conversation", CONVERSATION_TRANSITIONS, from, to);
}
