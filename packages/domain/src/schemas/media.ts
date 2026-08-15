export type MediaLabel = "FULL_ITEM" | "CONNECTOR" | "LABEL" | "DAMAGE" | "POWER_ON" | "OTHER";

// Section 12.1's photo request order. Phase 3 assigns labels by arrival
// order; per-category evidence policy (section 20) is Phase 5.
export const PHOTO_LABEL_ORDER: readonly MediaLabel[] = ["FULL_ITEM", "CONNECTOR", "LABEL"];
