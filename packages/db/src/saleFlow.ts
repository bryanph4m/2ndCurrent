import {
  assertItemTransition,
  assertListingTransition,
  assertOrderTransition,
  InvalidTransitionError,
  type ItemState,
  type ListingState,
  type OrderState,
} from "@secondcurrent/domain";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./client";
import { transitionWithAudit } from "./audit";
import { findOrCreateContact } from "./repositories/contactRepository";
import { findSaleTargetBySlug } from "./repositories/listingRepository";

// tx-scoped, unlike repositories/outboxRepository's enqueueOutboxMessage
// (which writes through the top-level db client) - these two sends must
// commit atomically with the state changes above them, same pattern
// marketplaceFlow.ts's own enqueueText helper follows.
function enqueueText(
  tx: Prisma.TransactionClient,
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

export const ITEM_SALE_PRODUCT_CODE = "ITEM_SALE";
// A flat percentage of the sale price. Computed server-side only - the
// client never supplies a price or a fee, same rule the recovery-check
// price used to follow.
export const COMMISSION_RATE = 0.1;

export function commissionCentsFor(priceCents: number): number {
  return Math.round(priceCents * COMMISSION_RATE);
}

export type CreateConnectCheckout = (input: {
  orderId: string;
  amountCents: number;
  currency: string;
  applicationFeeCents: number;
  sellerAccountId: string;
  successUrl: string;
  cancelUrl: string;
  productName: string;
}) => Promise<{ checkoutSessionId?: string | undefined; checkoutUrl: string }>;

export type CreateItemSaleCheckoutInput = {
  slug: string;
  buyerPhone: string;
  hashPhone: (phone: string) => string;
  encryptPhone: (phone: string) => string;
  appBaseUrl: string;
};

// Mirrors the deleted createRecoveryCheckOrder's shape: the Stripe network
// call happens outside any transaction, order/item state changes commit in
// one transaction once it returns.
export async function createItemSaleCheckout(
  input: CreateItemSaleCheckoutInput,
  createConnectCheckout: CreateConnectCheckout,
): Promise<{ checkoutUrl: string } | null> {
  const target = await findSaleTargetBySlug(input.slug);
  if (!target) {
    return null;
  }

  const buyer = await findOrCreateContact({
    phoneHash: input.hashPhone(input.buyerPhone),
    phoneCiphertext: input.encryptPhone(input.buyerPhone),
  });

  const existing = await db.serviceOrder.findFirst({
    where: {
      itemId: target.itemId,
      productCode: ITEM_SALE_PRODUCT_CODE,
      status: { in: ["DRAFT", "CHECKOUT_CREATED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.checkoutUrl) {
    return { checkoutUrl: existing.checkoutUrl };
  }

  const order = await db.serviceOrder.create({
    data: {
      contactId: buyer.id,
      itemId: target.itemId,
      productCode: ITEM_SALE_PRODUCT_CODE,
      amountCents: target.priceCents,
      currency: target.currency,
    },
  });

  const applicationFeeCents = commissionCentsFor(target.priceCents);
  const checkout = await createConnectCheckout({
    orderId: order.id,
    amountCents: target.priceCents,
    currency: target.currency,
    applicationFeeCents,
    sellerAccountId: target.sellerAccountId,
    successUrl: `${input.appBaseUrl}/checkout/buy-return?orderId=${order.id}`,
    cancelUrl: `${input.appBaseUrl}/item/${input.slug}`,
    productName: target.title,
  });

  await db.$transaction(async (tx) => {
    await transitionWithAudit({
      tx,
      entityType: "ServiceOrder",
      entityId: order.id,
      itemId: target.itemId,
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
  });

  return { checkoutUrl: checkout.checkoutUrl };
}

// Mirrors the deleted markOrderPaidAndQueueAnalysis: "marks one order paid
// once", a duplicate webhook hits assertOrderTransition("PAID", "PAID") and
// is reported as alreadyPaid rather than thrown.
export async function markItemSaleCompleted(input: {
  orderId: string;
  paymentId: string;
  checkoutSessionId?: string | undefined;
}): Promise<{ alreadyPaid: boolean }> {
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

      const applicationFeeCents = commissionCentsFor(order.amountCents);
      await tx.ledgerEntry.create({
        data: {
          orderId: input.orderId,
          type: "ITEM_SALE_COMMISSION",
          amountCents: applicationFeeCents,
          currency: order.currency,
          providerReference: input.paymentId,
        },
      });

      const listing = await tx.listing.findUniqueOrThrow({ where: { itemId: order.itemId } });
      await transitionWithAudit({
        tx,
        entityType: "Listing",
        entityId: listing.id,
        itemId: order.itemId,
        actorType: "system",
        action: "listing.sold",
        from: listing.status as ListingState,
        to: "SOLD",
        assertFn: assertListingTransition,
        applyUpdate: () =>
          tx.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } }),
      });

      const item = await tx.item.findUniqueOrThrow({ where: { id: order.itemId } });
      await transitionWithAudit({
        tx,
        entityType: "Item",
        entityId: order.itemId,
        itemId: order.itemId,
        actorType: "system",
        action: "item.closed",
        from: item.status as ItemState,
        to: "CLOSED",
        assertFn: assertItemTransition,
        applyUpdate: () =>
          tx.item.update({ where: { id: order.itemId }, data: { status: "CLOSED" } }),
      });

      await enqueueText(tx, {
        contactId: item.ownerContactId,
        idempotencyKey: `sale-complete-seller:${order.itemId}:v1`,
        text: "Your item sold. Payout is on its way.",
      });
      await enqueueText(tx, {
        contactId: order.contactId,
        idempotencyKey: `sale-complete-buyer:${order.id}:v1`,
        text: "Purchase confirmed. Thanks for buying through SecondCurrent.",
      });
    });
    return { alreadyPaid: false };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return { alreadyPaid: true };
    }
    throw error;
  }
}
