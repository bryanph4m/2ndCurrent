import { assertTransition } from "../services/transitions";

export type ItemState =
  | "INTAKE"
  | "QUEUED"
  | "ANALYZING"
  | "WAITING_FOR_EVIDENCE"
  | "WAITING_FOR_REVIEW"
  | "FINALIZING"
  | "READY"
  | "LISTED"
  | "RESERVED"
  | "MATCHED"
  | "HANDED_OFF"
  | "CLOSED"
  | "REJECTED"
  | "ERROR";

export const ITEM_TRANSITIONS: Record<ItemState, readonly ItemState[]> = {
  INTAKE: ["QUEUED"],
  QUEUED: ["ANALYZING"],
  ANALYZING: ["WAITING_FOR_EVIDENCE", "WAITING_FOR_REVIEW", "FINALIZING", "REJECTED", "ERROR"],
  WAITING_FOR_EVIDENCE: ["QUEUED"],
  // REJECTED alongside FINALIZING: a reviewer can spot a safety issue the
  // vision model missed (section 18.3 lets human review add a hard flag, it
  // just cannot remove one), so post-review rejection is a real outcome, not
  // only a pre-review one.
  WAITING_FOR_REVIEW: ["FINALIZING", "REJECTED"],
  FINALIZING: ["READY"],
  READY: ["LISTED", "CLOSED"],
  // LISTED -> CLOSED direct: an online sale pays and closes in one webhook,
  // with no in-person handoff wait - RESERVED/MATCHED/HANDED_OFF stay
  // specific to the peer-match flow's confirm-then-meet-up code exchange.
  LISTED: ["RESERVED", "CLOSED"],
  RESERVED: ["MATCHED"],
  MATCHED: ["HANDED_OFF"],
  HANDED_OFF: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
  ERROR: [],
};

export function assertItemTransition(from: ItemState, to: ItemState): void {
  assertTransition("Item", ITEM_TRANSITIONS, from, to);
}
