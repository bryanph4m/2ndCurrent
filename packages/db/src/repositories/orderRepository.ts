import { assertOrderTransition, type OrderState } from "@secondcurrent/domain";
import { db } from "../client";
import { transitionWithAudit } from "../audit";

export type CreateOrderInput = {
  contactId: string;
  itemId: string;
  productCode: string;
  amountCents: number;
  humanBudgetCents?: number;
};

export function createOrder(input: CreateOrderInput) {
  return db.serviceOrder.create({ data: input });
}

export function listOrders() {
  return db.serviceOrder.findMany({ orderBy: { createdAt: "desc" } });
}

export function findOrderByCheckoutSessionId(checkoutSessionId: string) {
  return db.serviceOrder.findUnique({ where: { checkoutSessionId } });
}

export function findOrderById(orderId: string) {
  return db.serviceOrder.findUnique({ where: { id: orderId } });
}

export async function transitionOrder(
  orderId: string,
  to: OrderState,
  actor: { type: string; id?: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findUniqueOrThrow({ where: { id: orderId } });
    await transitionWithAudit({
      tx,
      entityType: "ServiceOrder",
      entityId: orderId,
      itemId: order.itemId,
      actorType: actor.type,
      actorId: actor.id,
      action: "order.transition",
      from: order.status as OrderState,
      to,
      assertFn: assertOrderTransition,
      applyUpdate: () => tx.serviceOrder.update({ where: { id: orderId }, data: { status: to } }),
    });
  });
}
