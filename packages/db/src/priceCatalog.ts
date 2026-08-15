import type { PriceCatalogEntry } from "@secondcurrent/domain";
import catalogJson from "../../../fixtures/price-catalog.json";

type RawPriceCatalogEntry = {
  category: string;
  brand: string | null;
  connector: string | null;
  lowCents: number;
  midCents: number;
  highCents: number;
};

let cached: PriceCatalogEntry[] | undefined;

// Section 26: "a small local catalog, not live scraping." Cached for the
// process lifetime - the fixture file only changes on redeploy.
export function loadPriceCatalog(): PriceCatalogEntry[] {
  if (!cached) {
    const raw = catalogJson as RawPriceCatalogEntry[];
    cached = raw.map((entry) => ({
      category: entry.category as PriceCatalogEntry["category"],
      brand: entry.brand,
      connector: entry.connector,
      lowCents: entry.lowCents,
      midCents: entry.midCents,
      highCents: entry.highCents,
    }));
  }
  return cached;
}
