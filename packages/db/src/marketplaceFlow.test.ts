import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    item: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    listing: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    contact: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    demandRequest: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    match: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    impactEvent: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    outboxMessage: { upsert: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { confirmHandoff, matchDemand, offerListingForPublishedItem, handleMarketplaceCommand } =
  await import("./marketplaceFlow");

const safePassport = {
  publishedAt: new Date("2026-08-14"),
  recommendedRoute: "RESELL",
  safetyStatus: "CLEAR",
  dataRisk: "CLEAR",
  suggestedPriceCents: 1200,
  title: "Dell 65W USB-C power adapter",
  category: "laptop_power_adapter",
  connector: "usb_c",
  powerText: "65W",
  brand: "Dell",
  conditionGrade: "B",
};

function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.outboxMessage.upsert.mockResolvedValue({});
  dbMock.item.update.mockResolvedValue({});
  dbMock.listing.update.mockResolvedValue({});
  dbMock.match.update.mockResolvedValue({});
  dbMock.demandRequest.update.mockResolvedValue({});
  dbMock.impactEvent.create.mockResolvedValue({});
  dbMock.outboxMessage.create.mockResolvedValue({});
  dbMock.contact.update.mockResolvedValue({});
});

function connectDeps() {
  return {
    createConnectAccount: vi.fn().mockResolvedValue({ accountId: "acct_1" }),
    createConnectOnboardingLink: vi
      .fn()
      .mockResolvedValue({ url: "https://connect.example.com/1" }),
    appBaseUrl: "https://app.example.com",
  };
}

describe("marketplace flow", () => {
  it("offers an eligible published item for seller approval", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_1",
      ownerContactId: "seller_1",
      passport: safePassport,
      listing: null,
    });
    dbMock.listing.create.mockResolvedValue({ id: "listing_1" });

    await expect(offerListingForPublishedItem("item_1")).resolves.toBe("listing_1");
    expect(dbMock.listing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: "item_1", priceCents: 1200 }),
    });
    expect(dbMock.outboxMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ contactId: "seller_1" }),
      }),
    );
  });

  it("does not offer an unsafe item", async () => {
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_unsafe",
      ownerContactId: "seller_1",
      passport: { ...safePassport, safetyStatus: "DO_NOT_LIST" },
      listing: null,
    });

    await expect(offerListingForPublishedItem("item_unsafe")).resolves.toBeNull();
    expect(dbMock.listing.create).not.toHaveBeenCalled();
  });

  it("creates and sends a match for the seeded charger", async () => {
    dbMock.demandRequest.findUniqueOrThrow.mockResolvedValue({
      id: "demand_1",
      contactId: "buyer_1",
      locationCode: "LOCAL",
      structuredQuery: {
        category: "laptop_power_adapter",
        connector: "usb_c",
        minimumWatts: 65,
        brand: null,
        maxPriceCents: null,
        locationCode: "LOCAL",
      },
    });
    dbMock.listing.findMany.mockResolvedValue([
      {
        id: "listing_1",
        itemId: "item_1",
        status: "ACTIVE",
        sellerApprovedAt: new Date(),
        locationCode: "LOCAL",
        priceCents: 1200,
        matches: [],
        item: { status: "LISTED", passport: safePassport },
      },
    ]);
    dbMock.match.upsert.mockResolvedValue({ id: "match_1", status: "PROPOSED" });

    await expect(matchDemand("demand_1")).resolves.toEqual({ matchId: "match_1" });
    expect(dbMock.match.update).toHaveBeenCalledWith({
      where: { id: "match_1" },
      data: { status: "SENT" },
    });
    expect(dbMock.outboxMessage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ contactId: "buyer_1" }) }),
    );
  });

  it("requires both parties before completing a handoff", async () => {
    const baseMatch = {
      id: "match_1",
      status: "ACCEPTED",
      listingId: "listing_1",
      demandRequestId: "demand_1",
      sellerCodeHash: codeHash("SELLER1"),
      buyerCodeHash: codeHash("BUYER1"),
      sellerConfirmedAt: null,
      buyerConfirmedAt: null,
      demandRequest: { id: "demand_1", contactId: "buyer_1" },
      listing: {
        id: "listing_1",
        status: "RESERVED",
        itemId: "item_1",
        priceCents: 1200,
        item: {
          id: "item_1",
          status: "RESERVED",
          ownerContactId: "seller_1",
          weightGrams: 250,
        },
      },
    };
    const sellerConfirmationTime = new Date("2026-08-14T20:00:00Z");
    dbMock.match.findFirst
      .mockResolvedValueOnce(baseMatch)
      .mockResolvedValueOnce({ ...baseMatch, sellerConfirmedAt: sellerConfirmationTime });
    dbMock.match.findUniqueOrThrow
      .mockResolvedValueOnce({ ...baseMatch, sellerConfirmedAt: sellerConfirmationTime })
      .mockResolvedValueOnce({
        ...baseMatch,
        sellerConfirmedAt: sellerConfirmationTime,
        buyerConfirmedAt: new Date("2026-08-14T20:01:00Z"),
      });

    await expect(confirmHandoff("seller_1", "SELLER1")).resolves.toMatchObject({
      outcome: "HANDOFF_WAITING",
    });
    expect(dbMock.impactEvent.create).not.toHaveBeenCalled();
    expect(dbMock.match.update).toHaveBeenNthCalledWith(1, {
      where: { id: "match_1" },
      data: { sellerConfirmedAt: expect.any(Date) },
    });

    await expect(confirmHandoff("buyer_1", "BUYER1")).resolves.toMatchObject({
      outcome: "HANDOFF_COMPLETED",
    });
    expect(dbMock.match.update).toHaveBeenNthCalledWith(2, {
      where: { id: "match_1" },
      data: { buyerConfirmedAt: expect.any(Date) },
    });
    expect(dbMock.impactEvent.create).toHaveBeenCalledTimes(1);
    expect(dbMock.match.update).toHaveBeenCalledWith({
      where: { id: "match_1" },
      data: { status: "COMPLETED" },
    });
  });

  it("APPROVE creates a Connect account and texts an onboarding link the first time", async () => {
    dbMock.listing.findFirst.mockResolvedValue({
      id: "listing_1",
      itemId: "item_1",
      status: "DRAFT",
      item: {
        id: "item_1",
        status: "READY",
        passport: { ...safePassport, publicSlug: "demo-item" },
      },
    });
    dbMock.contact.findUniqueOrThrow.mockResolvedValue({
      id: "seller_1",
      stripeConnectAccountId: null,
      stripeConnectOnboardedAt: null,
    });
    const deps = connectDeps();

    const result = await handleMarketplaceCommand(
      { contactId: "seller_1", rawText: "APPROVE", command: { type: "APPROVE" } },
      deps,
    );

    expect(result).toEqual({ outcome: "LISTING_APPROVED", listingId: "listing_1" });
    expect(deps.createConnectAccount).toHaveBeenCalledTimes(1);
    expect(dbMock.contact.update).toHaveBeenCalledWith({
      where: { id: "seller_1" },
      data: { stripeConnectAccountId: "acct_1" },
    });
    expect(deps.createConnectOnboardingLink).toHaveBeenCalledWith({
      accountId: "acct_1",
      returnUrl: "https://app.example.com/item/demo-item",
      refreshUrl: "https://app.example.com/item/demo-item",
    });
    expect(dbMock.outboxMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: "seller_1",
          payload: { text: expect.stringContaining("https://connect.example.com/1") },
        }),
      }),
    );
  });

  it("APPROVE skips onboarding when the seller already has payouts set up", async () => {
    dbMock.listing.findFirst.mockResolvedValue({
      id: "listing_2",
      itemId: "item_2",
      status: "DRAFT",
      item: {
        id: "item_2",
        status: "READY",
        passport: { ...safePassport, publicSlug: "demo-item-2" },
      },
    });
    dbMock.contact.findUniqueOrThrow.mockResolvedValue({
      id: "seller_2",
      stripeConnectAccountId: "acct_existing",
      stripeConnectOnboardedAt: new Date("2026-08-15"),
    });
    const deps = connectDeps();

    await handleMarketplaceCommand(
      { contactId: "seller_2", rawText: "APPROVE", command: { type: "APPROVE" } },
      deps,
    );

    expect(deps.createConnectAccount).not.toHaveBeenCalled();
    expect(deps.createConnectOnboardingLink).not.toHaveBeenCalled();
    expect(dbMock.outboxMessage.create).not.toHaveBeenCalled();
  });
});
