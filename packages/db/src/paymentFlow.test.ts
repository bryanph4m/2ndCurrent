import { beforeEach, describe, expect, it, vi } from "vitest";

// Same shape as audit.test.ts's fakeTx, but standing in for the whole `db`
// client since markOrderPaidAndQueueAnalysis opens its own $transaction
// rather than taking tx as a parameter. Mocking the module (not spying on a
// real PrismaClient) means this never touches a database.
const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    serviceOrder: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    item: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    ledgerEntry: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./client", () => ({ db: dbMock }));

const { markOrderPaidAndQueueAnalysis } = await import("./paymentFlow");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.serviceOrder.update.mockResolvedValue({});
  dbMock.item.update.mockResolvedValue({});
  dbMock.ledgerEntry.create.mockResolvedValue({});
  dbMock.auditEvent.create.mockResolvedValue({});
});

describe("markOrderPaidAndQueueAnalysis", () => {
  it("marks a checkout-created order paid, writes one ledger entry, and queues the item", async () => {
    dbMock.serviceOrder.findUniqueOrThrow.mockResolvedValue({
      id: "order_1",
      itemId: "item_1",
      status: "CHECKOUT_CREATED",
      amountCents: 5_000,
      currency: "USD",
    });
    dbMock.item.findUniqueOrThrow.mockResolvedValue({
      id: "item_1",
      status: "WAITING_FOR_PAYMENT",
    });

    const result = await markOrderPaidAndQueueAnalysis({
      orderId: "order_1",
      paymentId: "pi_1",
      checkoutSessionId: "cs_test_1",
    });

    expect(result).toEqual({ alreadyPaid: false, itemId: "item_1" });
    expect(dbMock.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(dbMock.serviceOrder.update).toHaveBeenCalledWith({
      where: { id: "order_1" },
      data: {
        status: "PAID",
        paymentId: "pi_1",
        checkoutSessionId: "cs_test_1",
        paidAt: expect.any(Date),
      },
    });
    expect(dbMock.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        orderId: "order_1",
        type: "SERVICE_REVENUE",
        amountCents: 5_000,
        currency: "USD",
      },
    });
    expect(dbMock.item.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { status: "QUEUED" },
    });
  });

  it("treats a second PAID attempt as already paid: no ledger entry, no item transition", async () => {
    dbMock.serviceOrder.findUniqueOrThrow.mockResolvedValue({
      id: "order_1",
      itemId: "item_1",
      status: "PAID",
      amountCents: 5_000,
      currency: "USD",
    });

    const result = await markOrderPaidAndQueueAnalysis({ orderId: "order_1", paymentId: "pay_1" });

    expect(result).toEqual({ alreadyPaid: true, itemId: "item_1" });
    expect(dbMock.ledgerEntry.create).not.toHaveBeenCalled();
    expect(dbMock.item.update).not.toHaveBeenCalled();
    expect(dbMock.item.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
