import {
  assertItemTransition,
  assertOrderTransition,
  InvalidTransitionError,
  type ItemState,
  type OrderState,
} from "@secondcurrent/domain";
import { db } from "./client";
import { transitionWithAudit } from "./audit";

// Section 24.1's price list. A client can never influence this: the HTTP
// checkout endpoint's request schema has no amount field, and the SMS path
// never reads client-controlled input at all. Moves to PolicyVersion/env
// once more than one product exists.
export const RECOVERY_CHECK_PRODUCT_CODE = "RECOVERY_CHECK_SINGLE";
export const RECOVERY_CHECK_PRICE_CENTS = 5_000;

export type CreateCheckout = (input: {
  orderId: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
}) => Promise<{ checkoutSessionId?: string | undefined; checkoutUrl: string }>;

export type CreateRecoveryCheckOrderInput = {
  contactId: string;
  itemId: string;
  appBaseUrl: string;
};

// Section 16.2's rules: reuse an existing open checkout, never take a price
// from the caller. The checkout call to the payment provider happens outside any
// transaction (external network call); order/item state changes commit in
// one transaction once it returns.
export async function createRecoveryCheckOrder(
  input: CreateRecoveryCheckOrderInput,
  createCheckout: CreateCheckout,
): Promise<{ orderId: string; checkoutUrl: string }> {
  const existing = await db.serviceOrder.findFirst({
    where: { itemId: input.itemId, status: { in: ["DRAFT", "CHECKOUT_CREATED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.checkoutUrl) {
    return { orderId: existing.id, checkoutUrl: existing.checkoutUrl };
  }

  const order = await db.serviceOrder.create({
    data: {
      contactId: input.contactId,
      itemId: input.itemId,
      productCode: RECOVERY_CHECK_PRODUCT_CODE,
      amountCents: RECOVERY_CHECK_PRICE_CENTS,
    },
  });

  // Keep the return URL in the provider contract for mock and API-created
  // checkouts. Stripe Payment Links use their Dashboard-configured redirect.
  const returnUrl = `${input.appBaseUrl}/checkout/return?orderId=${order.id}`;

  const checkout = await createCheckout({
    orderId: order.id,
    amountCents: RECOVERY_CHECK_PRICE_CENTS,
    currency: order.currency,
    returnUrl,
  });

  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "ServiceOrder",
      entityId: order.id,
      itemId: input.itemId,
      actorType: "system",
      action: "order.checkout_created",
      from: order.status as OrderState,
      to: "CHECKOUT_CREATED",
      assertFn: assertOrderTransition,
      applyUpdate: () =>
        tx.serviceOrder.update({
          where: { id: order.id },
          data: {
            status: "CHECKOUT_CREATED",
            checkoutUrl: checkout.checkoutUrl,
            ...(checkout.checkoutSessionId
              ? { checkoutSessionId: checkout.checkoutSessionId }
              : {}),
          },
        }),
    });

    const item = await tx.item.findUniqueOrThrow({ where: { id: input.itemId } });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: input.itemId,
      itemId: input.itemId,
      actorType: "system",
      action: "item.awaiting_payment",
      from: item.status as ItemState,
      to: "WAITING_FOR_PAYMENT",
      assertFn: assertItemTransition,
      applyUpdate: () =>
        tx.item.update({ where: { id: input.itemId }, data: { status: "WAITING_FOR_PAYMENT" } }),
    });
  });

  return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
}

// "Marks one order paid once": a second PAID attempt hits
// assertOrderTransition("PAID", "PAID"), which InvalidTransitionError
// already rejects - caught here and reported as alreadyPaid rather than
// thrown, since a duplicate webhook is not a failure the provider should
// retry. Order status, the revenue ledger entry, and the item's QUEUED
// transition commit in one transaction so a retried webhook can never
// double-book revenue.
export async function markOrderPaidAndQueueAnalysis(input: {
  orderId: string;
  paymentId: string;
  checkoutSessionId?: string | undefined;
}): Promise<{ alreadyPaid: boolean; itemId: string }> {
  const order = await db.serviceOrder.findUniqueOrThrow({ where: { id: input.orderId } });

  try {
    await db.$transaction(async (tx) => {
      await transitionWithAudit({
        tx,
        entityType: "ServiceOrder",
        entityId: input.orderId,
        itemId: order.itemId,
        actorType: "system",
        action: "order.paid",
        from: order.status as OrderState,
        to: "PAID",
        assertFn: assertOrderTransition,
        applyUpdate: () =>
          tx.serviceOrder.update({
            where: { id: input.orderId },
            data: {
              status: "PAID",
              paymentId: input.paymentId,
              paidAt: new Date(),
              ...(input.checkoutSessionId ? { checkoutSessionId: input.checkoutSessionId } : {}),
            },
          }),
      });

      await tx.ledgerEntry.create({
        data: {
          orderId: input.orderId,
          type: "SERVICE_REVENUE",
          amountCents: order.amountCents,
          currency: order.currency,
        },
      });

      const item = await tx.item.findUniqueOrThrow({ where: { id: order.itemId } });
      await transitionWithAudit({
        tx,
        entityType: "Item",
        entityId: order.itemId,
        itemId: order.itemId,
        actorType: "system",
        action: "item.queued",
        from: item.status as ItemState,
        to: "QUEUED",
        assertFn: assertItemTransition,
        applyUpdate: () =>
          tx.item.update({ where: { id: order.itemId }, data: { status: "QUEUED" } }),
      });
    });
    return { alreadyPaid: false, itemId: order.itemId };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return { alreadyPaid: true, itemId: order.itemId };
    }
    throw error;
  }
}
