import { db } from "../client";

// Section 16.8's exclusion list (phone, contact id, internal item id, raw
// model output, provider ids, private media object keys) is enforced here by
// selecting only the columns the public page is allowed to show - id and
// itemId are never selected, so they cannot leak by a later rendering
// mistake either.
const PUBLIC_PASSPORT_SELECT = {
  publicSlug: true,
  title: true,
  brand: true,
  modelName: true,
  category: true,
  connector: true,
  powerText: true,
  conditionGrade: true,
  identityConfidence: true,
  safetyStatus: true,
  dataRisk: true,
  recommendedRoute: true,
  suggestedPriceCents: true,
  knownFacts: true,
  unknownFacts: true,
  evidenceSummary: true,
  humanReviewCount: true,
  disclaimer: true,
  publishedAt: true,
} as const;

export function findPublishedPassportBySlug(publicSlug: string) {
  return db.recoveryPassport.findFirst({
    where: { publicSlug, publishedAt: { not: null } },
    select: PUBLIC_PASSPORT_SELECT,
  });
}
