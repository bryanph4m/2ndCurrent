import { db } from "../client";

// Public browse/buy surfaces only ever see: publicSlug (never the real item
// id), price, and a derived purchasable flag - never the seller's contact id
// or Stripe account id. Same exclusion discipline as passportRepository's
// PUBLIC_PASSPORT_SELECT.

export type BrowseListing = {
  slug: string;
  title: string;
  category: string;
  conditionGrade: string;
  priceCents: number;
  currency: string;
  purchasable: boolean;
};

export async function listActiveListingsForBrowse(): Promise<BrowseListing[]> {
  const listings = await db.listing.findMany({
    where: { status: "ACTIVE", item: { passport: { publishedAt: { not: null } } } },
    orderBy: { createdAt: "desc" },
    select: {
      priceCents: true,
      currency: true,
      item: {
        select: {
          passport: {
            select: { publicSlug: true, title: true, category: true, conditionGrade: true },
          },
          owner: { select: { stripeConnectOnboardedAt: true } },
        },
      },
    },
  });

  return listings
    .filter((listing) => listing.item.passport !== null)
    .map((listing) => ({
      slug: listing.item.passport!.publicSlug,
      title: listing.item.passport!.title,
      category: listing.item.passport!.category,
      conditionGrade: listing.item.passport!.conditionGrade,
      priceCents: listing.priceCents,
      currency: listing.currency,
      purchasable: listing.item.owner.stripeConnectOnboardedAt !== null,
    }));
}

export type ListingForItemPage = {
  priceCents: number;
  currency: string;
  purchasable: boolean;
};

export async function findActiveListingByItemSlug(
  slug: string,
): Promise<ListingForItemPage | null> {
  const passport = await db.recoveryPassport.findFirst({
    where: { publicSlug: slug, publishedAt: { not: null } },
    select: {
      item: {
        select: {
          listing: { select: { status: true, priceCents: true, currency: true } },
          owner: { select: { stripeConnectOnboardedAt: true } },
        },
      },
    },
  });
  if (!passport || passport.item.listing?.status !== "ACTIVE") {
    return null;
  }
  return {
    priceCents: passport.item.listing.priceCents,
    currency: passport.item.listing.currency,
    purchasable: passport.item.owner.stripeConnectOnboardedAt !== null,
  };
}

// Checkout-route-only: resolves the real item id and the seller's Stripe
// account id server-side. Never sent to the browser - the route only ever
// returns a checkoutUrl to the client.
export type SaleTarget = {
  itemId: string;
  title: string;
  priceCents: number;
  currency: string;
  sellerAccountId: string;
};

export async function findSaleTargetBySlug(slug: string): Promise<SaleTarget | null> {
  const passport = await db.recoveryPassport.findFirst({
    where: { publicSlug: slug, publishedAt: { not: null } },
    select: {
      title: true,
      item: {
        select: {
          id: true,
          listing: { select: { status: true, priceCents: true, currency: true } },
          owner: { select: { stripeConnectAccountId: true, stripeConnectOnboardedAt: true } },
        },
      },
    },
  });
  if (
    !passport ||
    passport.item.listing?.status !== "ACTIVE" ||
    !passport.item.owner.stripeConnectAccountId ||
    !passport.item.owner.stripeConnectOnboardedAt
  ) {
    return null;
  }
  return {
    itemId: passport.item.id,
    title: passport.title,
    priceCents: passport.item.listing.priceCents,
    currency: passport.item.listing.currency,
    sellerAccountId: passport.item.owner.stripeConnectAccountId,
  };
}
