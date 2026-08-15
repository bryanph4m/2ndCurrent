import type { ConditionGrade } from "./route";
import type { ItemClass } from "./itemClass";

// Field is named `category` to match the doc's fixtures/price-catalog.json
// example (section 26); values are our normalized ItemClass, not free vision
// text, so lookups are exact.
export type PriceCatalogEntry = {
  category: ItemClass;
  brand: string | null;
  connector: string | null;
  lowCents: number;
  midCents: number;
  highCents: number;
};

export type PriceEstimate = {
  lowCents: number;
  midCents: number;
  highCents: number;
  quotedCents: number;
};

const CONFIDENCE_LOW_THRESHOLD = 0.7;

function findEntry(
  catalog: PriceCatalogEntry[],
  itemClass: ItemClass,
  brand: string | null,
  connector: string | null,
): PriceCatalogEntry | undefined {
  const inClass = catalog.filter((e) => e.category === itemClass);
  return (
    inClass.find((e) => e.brand === brand && e.connector === connector) ??
    inClass.find((e) => e.brand === brand) ??
    inClass.find((e) => e.connector === connector) ??
    inClass[0]
  );
}

// Section 26. Never prices a low-confidence identity, an ungraded item, or
// (by construction, since callers only call this after safety passes) a
// blocked item. "Reduce one band for condition C" is read as: quote the
// catalog's low price instead of its mid price. D and UNKNOWN are not priced
// at all - a catalog entry is graded for typical condition, not major damage.
export function estimateRouteValue(
  input: {
    itemClass: ItemClass;
    brand: string | null;
    connector: string | null;
    conditionGrade: ConditionGrade;
    identityConfidence: number;
  },
  catalog: PriceCatalogEntry[],
): PriceEstimate | null {
  if (input.identityConfidence < CONFIDENCE_LOW_THRESHOLD) {
    return null;
  }
  if (input.conditionGrade === "D" || input.conditionGrade === "UNKNOWN") {
    return null;
  }

  const entry = findEntry(catalog, input.itemClass, input.brand, input.connector);
  if (!entry) {
    return null;
  }

  const quotedCents = input.conditionGrade === "C" ? entry.lowCents : entry.midCents;
  return {
    lowCents: entry.lowCents,
    midCents: entry.midCents,
    highCents: entry.highCents,
    quotedCents,
  };
}
