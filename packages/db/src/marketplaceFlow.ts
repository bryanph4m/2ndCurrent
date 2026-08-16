import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BUYER_MATCH_PREFIX,
  DemandQuerySchema,
  HANDOFF_CODE_PREFIX,
  HANDOFF_COMPLETE_TEXT,
  HANDOFF_WAITING_TEXT,
  LISTING_APPROVAL_TEXT,
  LISTING_APPROVED_TEXT,
  LISTING_DECLINED_TEXT,
  NO_MATCH_TEXT,
  PAYOUT_ONBOARDING_PREFIX,
  assertItemTransition,
  assertListingTransition,
  assertMatchTransition,
  findBestMatch,
  parseDemandQuery,
  type DemandQuery,
  type ItemState,
  type ListingState,
  type MatchState,
  type MatchableListing,
  type ParsedCommand,
} from "@secondcurrent/domain";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./client";
import { transitionWithAudit } from "./audit";
import { enqueueOutboxMessage } from "./repositories/outboxRepository";
import { saveStripeConnectAccountId } from "./repositories/contactRepository";

// Injected the same way createRecoveryCheckOrder used to inject Stripe's
// checkout call: packages/db never imports a provider SDK directly.
export type EnsureSellerPayoutAccountDeps = {
  createConnectAccount: () => Promise<{ accountId: string }>;
  createConnectOnboardingLink: (input: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }) => Promise<{ url: string }>;
  appBaseUrl: string;
};

const DEFAULT_LOCATION_CODE = "LOCAL";
const HANDOFF_CODE_BYTES = 4;

type MarketplaceTx = Prisma.TransactionClient;

export type MarketplaceCommandResult =
  | { outcome: "DEMAND_CREATED"; demandRequestId: string; matchId: string | null }
  | { outcome: "LISTING_APPROVED"; listingId: string }
  | { outcome: "LISTING_DECLINED"; listingId: string }
  | { outcome: "MATCH_ACCEPTED"; matchId: string }
  | { outcome: "MATCH_DECLINED"; matchId: string }
  | { outcome: "HANDOFF_WAITING"; matchId: string }
  | { outcome: "HANDOFF_COMPLETED"; matchId: string }
  | { outcome: "NO_MARKETPLACE_ACTION" };

function enqueueText(
  tx: MarketplaceTx,
  input: { contactId: string; idempotencyKey: string; text: string },
) {
  return tx.outboxMessage.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      contactId: input.contactId,
      idempotencyKey: input.idempotencyKey,
      messageType: "text",
      payload: { text: input.text },
    },
    update: {},
  });
}

function handoffCode(): string {
  return randomBytes(HANDOFF_CODE_BYTES).toString("hex").toUpperCase();
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function codeMatches(expectedHash: string | null, suppliedCode: string): boolean {
  if (!expectedHash) return false;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashCode(suppliedCode), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function powerWatts(powerText: string | null): number | null {
  const match = powerText ? /\b(\d{1,4})\s*w\b/i.exec(powerText) : null;
  return match?.[1] ? Number(match[1]) : null;
}

function toMatchableListing(listing: {
  id: string;
  status: ListingState;
  sellerApprovedAt: Date | null;
  locationCode: string;
  priceCents: number;
  matches: Array<{ status: MatchState }>;
  item: {
    status: ItemState;
    passport: {
      publishedAt: Date | null;
      safetyStatus: "CLEAR" | "NEEDS_REVIEW" | "DO_NOT_LIST";
      dataRisk: string;
      category: string;
      connector: string | null;
      powerText: string | null;
      brand: string | null;
      conditionGrade: string;
    } | null;
  };
}): MatchableListing {
  const passport = listing.item.passport;
  return {
    id: listing.id,
    status: listing.status,
    sellerApproved: listing.sellerApprovedAt !== null,
    locationCode: listing.locationCode,
    priceCents: listing.priceCents,
    hasReservation: listing.matches.some((match) =>
      ["SENT", "ACCEPTED", "COMPLETED"].includes(match.status),
    ),
    itemStatus: listing.item.status,
    passportPublished: passport?.publishedAt !== null && passport !== null,
    safetyStatus: passport?.safetyStatus ?? "DO_NOT_LIST",
    dataRisk: passport?.dataRisk ?? "UNKNOWN",
    category: passport?.category ?? "unknown",
    connector: passport?.connector ?? null,
    powerWatts: powerWatts(passport?.powerText ?? null),
    brand: passport?.brand ?? null,
    conditionGrade: passport?.conditionGrade ?? "UNKNOWN",
  };
}

export async function createDemandRequest(input: {
  contactId: string;
  rawText: string;
  description: string;
  locationCode?: string;
}): Promise<{ id: string; query: DemandQuery }> {
  const query = parseDemandQuery(input.description, input.locationCode ?? DEFAULT_LOCATION_CODE);
  const demand = await db.demandRequest.create({
    data: {
      contactId: input.contactId,
      rawText: input.rawText,
      structuredQuery: query,
      locationCode: query.locationCode,
      maxPriceCents: query.maxPriceCents,
    },
  });
  await db.auditEvent.create({
    data: {
      actorType: "contact",
      actorId: input.contactId,
      action: "demand.created",
      entityType: "DemandRequest",
      entityId: demand.id,
      after: { status: "OPEN", structuredQuery: query },
    },
  });
  return { id: demand.id, query };
}

export async function offerListingForPublishedItem(itemId: string): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const item = await tx.item.findUniqueOrThrow({
      where: { id: itemId },
      include: { passport: true, listing: true },
    });
    if (item.listing) return item.listing.id;
    const passport = item.passport;
    if (
      !passport?.publishedAt ||
      passport.recommendedRoute !== "RESELL" ||
      passport.safetyStatus !== "CLEAR" ||
      passport.dataRisk.toUpperCase() !== "CLEAR" ||
      passport.suggestedPriceCents === null
    ) {
      return null;
    }

    const listing = await tx.listing.create({
      data: {
        itemId,
        priceCents: passport.suggestedPriceCents,
        locationCode: DEFAULT_LOCATION_CODE,
      },
    });
    await tx.auditEvent.create({
      data: {
        itemId,
        actorType: "system",
        action: "listing.created",
        entityType: "Listing",
        entityId: listing.id,
        after: { status: "DRAFT", locationCode: DEFAULT_LOCATION_CODE },
      },
    });
    await enqueueText(tx, {
      contactId: item.ownerContactId,
      idempotencyKey: `listing-approval:${listing.id}:v1`,
      text: LISTING_APPROVAL_TEXT,
    });
    return listing.id;
  });
}

export async function matchDemand(demandRequestId: string): Promise<{ matchId: string | null }> {
  const demand = await db.demandRequest.findUniqueOrThrow({ where: { id: demandRequestId } });
  const validatedQuery = DemandQuerySchema.parse({
    ...(demand.structuredQuery as object),
    locationCode: demand.locationCode,
  });

  const listings = await db.listing.findMany({
    where: { status: "ACTIVE", sellerApprovedAt: { not: null } },
    include: {
      item: { include: { passport: true } },
      matches: { where: { status: { in: ["SENT", "ACCEPTED", "COMPLETED"] } } },
    },
  });
  const best = findBestMatch(
    validatedQuery,
    listings.map((listing) =>
      toMatchableListing(listing as Parameters<typeof toMatchableListing>[0]),
    ),
  );

  if (!best) {
    await db.$transaction((tx) =>
      enqueueText(tx, {
        contactId: demand.contactId,
        idempotencyKey: `demand-no-match:${demand.id}:v1`,
        text: NO_MATCH_TEXT,
      }),
    );
    return { matchId: null };
  }

  const selected = listings.find((listing) => listing.id === best.listingId)!;
  return db.$transaction(async (tx) => {
    const match = await tx.match.upsert({
      where: {
        listingId_demandRequestId: { listingId: best.listingId, demandRequestId: demand.id },
      },
      create: {
        listingId: best.listingId,
        demandRequestId: demand.id,
        score: best.score,
        reasonCodes: best.reasonCodes,
      },
      update: {},
    });

    if (match.status === "PROPOSED") {
      await transitionWithAudit({
        tx,
        entityType: "Match",
        entityId: match.id,
        itemId: selected.itemId,
        actorType: "system",
        action: "match.sent",
        from: "PROPOSED",
        to: "SENT",
        assertFn: assertMatchTransition,
        applyUpdate: () => tx.match.update({ where: { id: match.id }, data: { status: "SENT" } }),
      });
      await tx.demandRequest.update({ where: { id: demand.id }, data: { status: "MATCHED" } });
      await tx.auditEvent.create({
        data: {
          actorType: "system",
          action: "demand.matched",
          entityType: "DemandRequest",
          entityId: demand.id,
          before: { status: "OPEN" },
          after: { status: "MATCHED", matchId: match.id },
        },
      });
      const passport = selected.item.passport!;
      const text = `${BUYER_MATCH_PREFIX}: ${passport.title}, $${(selected.priceCents / 100).toFixed(2)}, ${selected.locationCode}. Reply APPROVE to accept or DECLINE to pass.`;
      await enqueueText(tx, {
        contactId: demand.contactId,
        idempotencyKey: `buyer-match:${match.id}:v1`,
        text,
      });
    }
    return { matchId: match.id };
  });
}

async function approveSellerListing(
  contactId: string,
  deps: EnsureSellerPayoutAccountDeps,
): Promise<MarketplaceCommandResult | null> {
  const listing = await db.listing.findFirst({
    where: { status: "DRAFT", item: { ownerContactId: contactId } },
    include: { item: { include: { passport: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!listing) return null;
  const passport = listing.item.passport;
  if (
    !passport ||
    !passport.publishedAt ||
    passport.safetyStatus !== "CLEAR" ||
    passport.dataRisk.toUpperCase() !== "CLEAR"
  ) {
    throw new Error("Listing cannot be approved without a published, clear passport");
  }

  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "Listing",
      entityId: listing.id,
      itemId: listing.itemId,
      actorType: "contact",
      actorId: contactId,
      action: "listing.approved",
      from: "DRAFT",
      to: "ACTIVE",
      assertFn: assertListingTransition,
      applyUpdate: () =>
        tx.listing.update({
          where: { id: listing.id },
          data: { status: "ACTIVE", sellerApprovedAt: new Date() },
        }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: listing.itemId,
      itemId: listing.itemId,
      actorType: "contact",
      actorId: contactId,
      action: "item.listed",
      from: listing.item.status as ItemState,
      to: "LISTED",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: listing.itemId }, data: { status: "LISTED" } }),
    });
    await enqueueText(tx, {
      contactId,
      idempotencyKey: `listing-approved:${listing.id}:v1`,
      text: LISTING_APPROVED_TEXT,
    });
  });

  // Outside the transaction: this is a real Stripe network call, same rule
  // as createRecoveryCheckOrder used to follow. A seller who is already
  // connected just gets a fresh onboarding link (Account Links expire
  // quickly and are single-use, so there is nothing worth caching here).
  await ensureSellerPayoutOnboarding(contactId, passport.publicSlug, deps);

  return { outcome: "LISTING_APPROVED", listingId: listing.id };
}

async function ensureSellerPayoutOnboarding(
  contactId: string,
  itemSlug: string,
  deps: EnsureSellerPayoutAccountDeps,
): Promise<void> {
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  // Onboarding is a one-time setup step, not a per-listing one - a seller
  // who already has payouts working should not get asked again just for
  // listing a second item.
  if (contact.stripeConnectOnboardedAt) {
    return;
  }

  let accountId = contact.stripeConnectAccountId;
  if (!accountId) {
    const account = await deps.createConnectAccount();
    accountId = account.accountId;
    await saveStripeConnectAccountId(contactId, accountId);
  }

  const returnUrl = `${deps.appBaseUrl}/item/${itemSlug}`;
  const link = await deps.createConnectOnboardingLink({
    accountId,
    returnUrl,
    refreshUrl: returnUrl,
  });
  await enqueueOutboxMessage({
    contactId,
    idempotencyKey: `payout-onboarding:${accountId}:${itemSlug}`,
    messageType: "text",
    payload: { text: `${PAYOUT_ONBOARDING_PREFIX}${link.url}` },
  });
}

async function declineSellerListing(contactId: string): Promise<MarketplaceCommandResult | null> {
  const listing = await db.listing.findFirst({
    where: { status: "DRAFT", item: { ownerContactId: contactId } },
    include: { item: true },
    orderBy: { createdAt: "desc" },
  });
  if (!listing) return null;
  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "Listing",
      entityId: listing.id,
      itemId: listing.itemId,
      actorType: "contact",
      actorId: contactId,
      action: "listing.withdrawn",
      from: "DRAFT",
      to: "WITHDRAWN",
      assertFn: assertListingTransition,
      applyUpdate: () =>
        tx.listing.update({ where: { id: listing.id }, data: { status: "WITHDRAWN" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: listing.itemId,
      itemId: listing.itemId,
      actorType: "contact",
      actorId: contactId,
      action: "item.closed_without_listing",
      from: listing.item.status as ItemState,
      to: "CLOSED",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: listing.itemId }, data: { status: "CLOSED" } }),
    });
    await enqueueText(tx, {
      contactId,
      idempotencyKey: `listing-declined:${listing.id}:v1`,
      text: LISTING_DECLINED_TEXT,
    });
  });
  return { outcome: "LISTING_DECLINED", listingId: listing.id };
}

async function respondToBuyerMatch(
  contactId: string,
  accept: boolean,
): Promise<MarketplaceCommandResult | null> {
  const match = await db.match.findFirst({
    where: { status: "SENT", demandRequest: { contactId } },
    include: {
      demandRequest: true,
      listing: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!match) return null;

  if (!accept) {
    await db.$transaction(async (tx) => {
      await transitionWithAudit({
        tx,
        entityType: "Match",
        entityId: match.id,
        itemId: match.listing.itemId,
        actorType: "contact",
        actorId: contactId,
        action: "match.declined",
        from: "SENT",
        to: "DECLINED",
        assertFn: assertMatchTransition,
        applyUpdate: () =>
          tx.match.update({ where: { id: match.id }, data: { status: "DECLINED" } }),
      });
      await tx.demandRequest.update({
        where: { id: match.demandRequestId },
        data: { status: "OPEN" },
      });
    });
    return { outcome: "MATCH_DECLINED", matchId: match.id };
  }

  const sellerCode = handoffCode();
  const buyerCode = handoffCode();
  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "Match",
      entityId: match.id,
      itemId: match.listing.itemId,
      actorType: "contact",
      actorId: contactId,
      action: "match.accepted",
      from: "SENT",
      to: "ACCEPTED",
      assertFn: assertMatchTransition,
      applyUpdate: () =>
        tx.match.update({
          where: { id: match.id },
          data: {
            status: "ACCEPTED",
            sellerCodeHash: hashCode(sellerCode),
            buyerCodeHash: hashCode(buyerCode),
          },
        }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Listing",
      entityId: match.listingId,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "listing.reserved",
      from: match.listing.status as ListingState,
      to: "RESERVED",
      assertFn: assertListingTransition,
      applyUpdate: () =>
        tx.listing.update({ where: { id: match.listingId }, data: { status: "RESERVED" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: match.listing.itemId,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "item.reserved",
      from: match.listing.item.status as ItemState,
      to: "RESERVED",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: match.listing.itemId }, data: { status: "RESERVED" } }),
    });
    const instruction = (code: string) =>
      `${HANDOFF_CODE_PREFIX}: ${code}. Meet at ${match.listing.locationCode}, then text DONE ${code}.`;
    await enqueueText(tx, {
      contactId: match.listing.item.ownerContactId,
      idempotencyKey: `handoff-code:seller:${match.id}:v1`,
      text: instruction(sellerCode),
    });
    await enqueueText(tx, {
      contactId,
      idempotencyKey: `handoff-code:buyer:${match.id}:v1`,
      text: instruction(buyerCode),
    });
  });
  return { outcome: "MATCH_ACCEPTED", matchId: match.id };
}

export async function confirmHandoff(
  contactId: string,
  code: string,
): Promise<MarketplaceCommandResult> {
  const match = await db.match.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [{ demandRequest: { contactId } }, { listing: { item: { ownerContactId: contactId } } }],
    },
    include: {
      demandRequest: true,
      listing: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!match) return { outcome: "NO_MARKETPLACE_ACTION" };

  const isSeller = match.listing.item.ownerContactId === contactId;
  const isBuyer = match.demandRequest.contactId === contactId;
  const valid =
    (isSeller && codeMatches(match.sellerCodeHash, code)) ||
    (isBuyer && codeMatches(match.buyerCodeHash, code));
  if (!valid) return { outcome: "NO_MARKETPLACE_ACTION" };

  return db.$transaction(async (tx) => {
    const now = new Date();
    await tx.match.update({
      where: { id: match.id },
      data: isSeller ? { sellerConfirmedAt: now } : { buyerConfirmedAt: now },
    });
    const confirmedMatch = await tx.match.findUniqueOrThrow({ where: { id: match.id } });
    const sellerConfirmedAt = confirmedMatch.sellerConfirmedAt;
    const buyerConfirmedAt = confirmedMatch.buyerConfirmedAt;
    await tx.auditEvent.create({
      data: {
        itemId: match.listing.itemId,
        actorType: "contact",
        actorId: contactId,
        action: isSeller ? "handoff.seller_confirmed" : "handoff.buyer_confirmed",
        entityType: "Match",
        entityId: match.id,
        after: {
          sellerConfirmed: Boolean(sellerConfirmedAt),
          buyerConfirmed: Boolean(buyerConfirmedAt),
        },
      },
    });

    if (!sellerConfirmedAt || !buyerConfirmedAt) {
      await enqueueText(tx, {
        contactId,
        idempotencyKey: `handoff-waiting:${match.id}:${isSeller ? "seller" : "buyer"}:v1`,
        text: HANDOFF_WAITING_TEXT,
      });
      return { outcome: "HANDOFF_WAITING", matchId: match.id };
    }

    await transitionWithAudit({
      tx,
      entityType: "Match",
      entityId: match.id,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "match.completed",
      from: "ACCEPTED",
      to: "COMPLETED",
      assertFn: assertMatchTransition,
      applyUpdate: () =>
        tx.match.update({ where: { id: match.id }, data: { status: "COMPLETED" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Listing",
      entityId: match.listingId,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "listing.sold",
      from: "RESERVED",
      to: "SOLD",
      assertFn: assertListingTransition,
      applyUpdate: () =>
        tx.listing.update({ where: { id: match.listingId }, data: { status: "SOLD" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: match.listing.itemId,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "item.matched",
      from: "RESERVED",
      to: "MATCHED",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: match.listing.itemId }, data: { status: "MATCHED" } }),
    });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: match.listing.itemId,
      itemId: match.listing.itemId,
      actorType: "system",
      action: "item.handed_off",
      from: "MATCHED",
      to: "HANDED_OFF",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: match.listing.itemId }, data: { status: "HANDED_OFF" } }),
    });
    await tx.demandRequest.update({
      where: { id: match.demandRequestId },
      data: { status: "CLOSED" },
    });
    await tx.impactEvent.create({
      data: {
        itemId: match.listing.itemId,
        type: "LOCAL_HANDOFF",
        quantity: match.listing.item.weightGrams ?? null,
        unit: match.listing.item.weightGrams ? "grams" : null,
        valueCents: match.listing.priceCents,
        evidence: { matchId: match.id, sellerConfirmed: true, buyerConfirmed: true },
      },
    });
    for (const partyContactId of [
      match.listing.item.ownerContactId,
      match.demandRequest.contactId,
    ]) {
      await enqueueText(tx, {
        contactId: partyContactId,
        idempotencyKey: `handoff-complete:${match.id}:${partyContactId}:v1`,
        text: HANDOFF_COMPLETE_TEXT,
      });
    }
    return { outcome: "HANDOFF_COMPLETED", matchId: match.id };
  });
}

export async function handleMarketplaceCommand(
  input: {
    contactId: string;
    rawText: string;
    command: ParsedCommand;
  },
  deps: EnsureSellerPayoutAccountDeps,
): Promise<MarketplaceCommandResult> {
  if (input.command.type === "NEED") {
    const demand = await createDemandRequest({
      contactId: input.contactId,
      rawText: input.rawText,
      description: input.command.description,
    });
    const match = await matchDemand(demand.id);
    return { outcome: "DEMAND_CREATED", demandRequestId: demand.id, matchId: match.matchId };
  }
  if (input.command.type === "APPROVE") {
    return (
      (await approveSellerListing(input.contactId, deps)) ??
      (await respondToBuyerMatch(input.contactId, true)) ?? { outcome: "NO_MARKETPLACE_ACTION" }
    );
  }
  if (input.command.type === "DECLINE") {
    return (
      (await declineSellerListing(input.contactId)) ??
      (await respondToBuyerMatch(input.contactId, false)) ?? { outcome: "NO_MARKETPLACE_ACTION" }
    );
  }
  if (input.command.type === "DONE") {
    return confirmHandoff(input.contactId, input.command.code);
  }
  return { outcome: "NO_MARKETPLACE_ACTION" };
}
