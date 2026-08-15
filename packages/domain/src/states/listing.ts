import { assertTransition } from "../services/transitions";

export type ListingState = "DRAFT" | "ACTIVE" | "RESERVED" | "SOLD" | "WITHDRAWN" | "EXPIRED";

export const LISTING_TRANSITIONS: Record<ListingState, readonly ListingState[]> = {
  DRAFT: ["ACTIVE", "WITHDRAWN"],
  ACTIVE: ["RESERVED", "WITHDRAWN", "EXPIRED"],
  RESERVED: ["SOLD", "ACTIVE"],
  SOLD: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export function assertListingTransition(from: ListingState, to: ListingState): void {
  assertTransition("Listing", LISTING_TRANSITIONS, from, to);
}
