import { assertTransition } from "../services/transitions";

export type ListingState = "DRAFT" | "ACTIVE" | "RESERVED" | "SOLD" | "WITHDRAWN" | "EXPIRED";

export const LISTING_TRANSITIONS: Record<ListingState, readonly ListingState[]> = {
  DRAFT: ["ACTIVE", "WITHDRAWN"],
  // ACTIVE -> SOLD direct: an online purchase pays immediately, with no
  // separate reserved-while-deciding step the way a peer match has.
  ACTIVE: ["RESERVED", "SOLD", "WITHDRAWN", "EXPIRED"],
  RESERVED: ["SOLD", "ACTIVE"],
  SOLD: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export function assertListingTransition(from: ListingState, to: ListingState): void {
  assertTransition("Listing", LISTING_TRANSITIONS, from, to);
}
