import { z } from "zod";

export const DemandQuerySchema = z.object({
  category: z.string().nullable(),
  connector: z.string().nullable(),
  minimumWatts: z.number().positive().nullable(),
  brand: z.string().nullable(),
  maxPriceCents: z.number().int().positive().nullable(),
  locationCode: z.string().min(1),
});

export type DemandQuery = z.infer<typeof DemandQuerySchema>;

export type MatchableListing = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "RESERVED" | "SOLD" | "WITHDRAWN" | "EXPIRED";
  sellerApproved: boolean;
  locationCode: string;
  priceCents: number;
  hasReservation: boolean;
  itemStatus: string;
  passportPublished: boolean;
  safetyStatus: "CLEAR" | "NEEDS_REVIEW" | "DO_NOT_LIST";
  dataRisk: string;
  category: string;
  connector: string | null;
  powerWatts: number | null;
  brand: string | null;
  conditionGrade: string;
};

export type ScoredMatch = {
  listingId: string;
  score: number;
  reasonCodes: string[];
};

const BRAND_NAMES = ["dell", "apple", "hp", "lenovo", "asus", "acer", "samsung"] as const;

function normalizeConnector(text: string): string | null {
  if (/\busb[\s-]?c\b/i.test(text)) return "usb_c";
  if (/\bhdmi\b/i.test(text)) return "hdmi";
  if (/\bdisplay[\s-]?port\b/i.test(text)) return "displayport";
  if (/\bbarrel\b/i.test(text)) return "barrel";
  if (/\blightning\b/i.test(text)) return "lightning";
  return null;
}

function normalizeCategory(text: string): string | null {
  if (/\b(charger|power\s+adapter|ac\s+adapter)\b/i.test(text)) return "laptop_power_adapter";
  if (/\bhdmi\s+cable\b/i.test(text)) return "hdmi_cable";
  if (/\busb[\s-]?c\s+cable\b/i.test(text)) return "usb_c_cable";
  if (/\bkeyboard\b/i.test(text)) return "keyboard";
  if (/\bmouse\b/i.test(text)) return "mouse";
  if (/\bheadphones?\b/i.test(text)) return "headphones";
  if (/\busb\s+hub\b/i.test(text)) return "usb_hub";
  return null;
}

function parsePriceCents(text: string): number | null {
  const match = /(?:under|max(?:imum)?|up\s+to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i.exec(text);
  if (!match?.[1]) return null;
  return Math.round(Number(match[1]) * 100);
}

export function parseDemandQuery(description: string, locationCode = "LOCAL"): DemandQuery {
  const wattsMatch = /\b(\d{1,4})\s*w(?:att)?s?\b/i.exec(description);
  const brand = BRAND_NAMES.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(description),
  );

  return DemandQuerySchema.parse({
    category: normalizeCategory(description),
    connector: normalizeConnector(description),
    minimumWatts: wattsMatch?.[1] ? Number(wattsMatch[1]) : null,
    brand: brand ? brand[0]!.toUpperCase() + brand.slice(1) : null,
    maxPriceCents: parsePriceCents(description),
    locationCode,
  });
}

function normal(value: string | null): string | null {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_") ?? null
  );
}

export function isListingEligible(listing: MatchableListing): boolean {
  return (
    listing.status === "ACTIVE" &&
    listing.sellerApproved &&
    listing.passportPublished &&
    listing.safetyStatus === "CLEAR" &&
    normal(listing.dataRisk) === "clear" &&
    listing.itemStatus === "LISTED" &&
    !listing.hasReservation
  );
}

export function scoreListing(query: DemandQuery, listing: MatchableListing): ScoredMatch | null {
  if (!isListingEligible(listing)) return null;

  const reasons: string[] = [];
  let score = 0;

  if (query.category && normal(query.category) === normal(listing.category)) {
    score += 40;
    reasons.push("CATEGORY_EXACT");
  }
  if (query.connector && normal(query.connector) === normal(listing.connector)) {
    score += 25;
    reasons.push("CONNECTOR_EXACT");
  }
  if (
    query.minimumWatts !== null &&
    listing.powerWatts !== null &&
    listing.powerWatts >= query.minimumWatts
  ) {
    score += 15;
    reasons.push("POWER_MEETS_MINIMUM");
  }
  if (query.brand && normal(query.brand) === normal(listing.brand)) {
    score += 5;
    reasons.push("BRAND_MATCH");
  }
  if (["A", "B", "C"].includes(listing.conditionGrade.toUpperCase())) {
    score += 5;
    reasons.push("CONDITION_ACCEPTED");
  }
  if (query.maxPriceCents === null || listing.priceCents <= query.maxPriceCents) {
    score += 5;
    reasons.push("PRICE_WITHIN_LIMIT");
  }
  if (normal(query.locationCode) === normal(listing.locationCode)) {
    score += 5;
    reasons.push("SAME_LOCATION");
  }

  return { listingId: listing.id, score, reasonCodes: reasons };
}

export function findBestMatch(
  query: DemandQuery,
  listings: readonly MatchableListing[],
  minimumScore = 80,
): ScoredMatch | null {
  return (
    listings
      .map((listing) => scoreListing(query, listing))
      .filter((match): match is ScoredMatch => match !== null && match.score >= minimumScore)
      .sort((a, b) => b.score - a.score || a.listingId.localeCompare(b.listingId))[0] ?? null
  );
}
