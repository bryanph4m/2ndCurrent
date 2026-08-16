import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    recoveryPassport: { findFirst: vi.fn() },
    contact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    serviceOrder: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    ledgerEntry: { create: vi.fn() },
    listing: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    item: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    outboxMessage: { upsert: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { createItemSaleCheckout, markItemSaleCompleted, commissionCentsFor } =
  await import("./saleFlow");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.auditEvent.create.mockResolvedValue({});
  dbMock.outboxMessage.upsert.mockResolvedValue({});
  dbMock.serviceOrder.update.mockResolvedValue({});
  dbMock.listing.update.mockResolvedValue({});
  dbMock.item.update.mockResolvedValue({});
  dbMock.ledgerEntry.create.mockResolvedValue({});
});

const cryptoDeps = {
  hashPhone: (phone: string) => `hash:${phone}`,
  encryptPhone: (phone: string) => `enc:${phone}`,
};

const saleTargetPassport = {
  title: "Dell 65W USB-C power adapter",
  item: {
    id: "item_1",
    listing: { status: "ACTIVE", priceCents: 1200, currency: "USD" },
    owner: { stripeConnectAccountId: "acct_1", stripeConnectOnboardedAt: new Date("2026-08-15") },
  },
};

describe("commissionCentsFor", () => {
  it("is a flat 10% of the sale price, rounded", () => {
    expect(commissionCentsFor(1200)).toBe(120);
    expect(commissionCentsFor(999)).toBe(100);
  });
});

describe("createItemSaleCheckout", () => {
  it("returns null when the item has no purchasable listing", async () => {
    dbMock.recoveryPassport.findFirst.mockResolvedValue(null);

    const result = await createItemSaleCheckout(
      {
        slug: "missing-item",
        buyerPhone: "+15551234567",
        ...cryptoDeps,
        appBaseUrl: "https://app.example.com",
      },
      vi.fn(),
    );

    expect(result).toBeNull();
  });

  it("creates a buyer contact, a sale order, and a Connect checkout with the right commission", async () => {
    dbMock.recoveryPassport.findFirst.mockResolvedValue(saleTargetPassport);
    dbMock.contact.findUnique.mockResolvedValue(null);
    dbMock.contact.create.mockResolvedValue({ id: "buyer_1" });
    dbMock.serviceOrder.findFirst.mockResolvedValue(null);
    dbMock.serviceOrder.create.mockResolvedValue({ id: "order_1", status: "DRAFT" });
    const createConnectCheckout = vi
      .fn()
      .mockResolvedValue({ checkoutSessionId: "cs_1", checkoutUrl: "https://stripe.example/cs_1" });

    const result = await createItemSaleCheckout(
      {
        slug: "demo-item",
        buyerPhone: "+15551234567",
        ...cryptoDeps,
        appBaseUrl: "https://app.example.com",
      },
      createConnectCheckout,
    );

    expect(result).toEqual({ checkoutUrl: "https://stripe.example/cs_1" });
    expect(dbMock.contact.create).toHaveBeenCalledWith({
      data: {
        phoneHash: "hash:+15551234567",
        phoneCiphertext: "enc:+15551234567",
        linqChatId: null,
      },
    });
    expect(dbMock.serviceOrder.create).toHaveBeenCalledWith({
      data: {
        contactId: "buyer_1",
        itemId: "item_1",
        productCode: "ITEM_SALE",
        amountCents: 1200,
        currency: "USD",
      },
    });
    expect(createConnectCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "order_1",
        amountCents: 1200,
        currency: "USD",
        applicationFeeCents: 120,
        sellerAccountId: "acct_1",
      }),
    );
    expect(dbMock.serviceOrder.update).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: expect.objectContaining({
        status: "CHECKOUT_CREATED",
        checkoutUrl: "https://stripe.example/cs_1",
        checkoutSessionId: "cs_1",
      }),
    });
  });

  it("reuses an existing open checkout instead of creating a second one", async () => {
    dbMock.recoveryPassport.findFirst.mockResolvedValue(saleTargetPassport);
    dbMock.contact.findUnique.mockResolvedValue({ id: "buyer_1", linqChatId: null });
    dbMock.serviceOrder.findFirst.mockResolvedValue({
      id: "order_1",
      checkoutUrl: "https://stripe.example/existing",
    });
    const createConnectCheckout = vi.fn();

    const result = await createItemSaleCheckout(
      {
        slug: "demo-item",
        buyerPhone: "+15551234567",
        ...cryptoDeps,
        appBaseUrl: "https://app.example.com",
      },
      createConnectCheckout,
    );

    expect(result).toEqual({ checkoutUrl: "https://stripe.example/existing" });
    expect(createConnectCheckout).not.toHaveBeenCalled();
    expect(dbMock.serviceOrder.create).not.toHaveBeenCalled();
  });
});

describe("markItemSaleCompleted", () => {
  it("marks the order paid, records the commission, sells the listing, and closes the item", async () => {
    dbMock.serviceOrder.findUniqueOrThrow.mockResolvedValue({
      id: "order_1",
      itemId: "item_1",
      contactId: "buyer_1",
      status: "CHECKOUT_CREATED",
      amountCents: 1200,
      currency: "USD",
    });
    dbMock.listing.findUniqueOrThrow.mockResolvedValue({ id: "listing_1", status: "ACTIVE" });
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_1",
      status: "LISTED",
      ownerContactId: "seller_1",
    });

    const result = await markItemSaleCompleted({ orderId: "order_1", paymentId: "pi_1" });

    expect(result).toEqual({ alreadyPaid: false });
    expect(dbMock.serviceOrder.update).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: expect.objectContaining({ status: "PAID", paymentId: "pi_1" }),
    });
    expect(dbMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "order_1",
        type: "ITEM_SALE_COMMISSION",
        amountCents: 120,
        providerReference: "pi_1",
      }),
    });
    expect(dbMock.listing.update).toHaveBeenCalledWith({
      where: { id: "listing_1" },
      data: { status: "SOLD" },
    });
    expect(dbMock.item.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { status: "CLOSED" },
    });
    expect(dbMock.outboxMessage.upsert).toHaveBeenCalledTimes(2);
  });

  it("reports alreadyPaid instead of double-booking revenue on a retried webhook", async () => {
    dbMock.serviceOrder.findUniqueOrThrow.mockResolvedValue({
      id: "order_1",
      itemId: "item_1",
      contactId: "buyer_1",
      status: "PAID",
      amountCents: 1200,
      currency: "USD",
    });

    const result = await markItemSaleCompleted({ orderId: "order_1", paymentId: "pi_1" });

    expect(result).toEqual({ alreadyPaid: true });
    expect(dbMock.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
