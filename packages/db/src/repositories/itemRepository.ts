import { assertItemTransition, type ItemState } from "@secondcurrent/domain";
import { db } from "../client";
import { transitionWithAudit } from "../audit";

export type CreateItemInput = {
  ownerContactId: string;
  sellerDescription?: string;
  category?: string;
  activePolicyVersion: string;
};

export function createItem(input: CreateItemInput) {
  return db.item.create({ data: input });
}

export function listItems() {
  return db.item.findMany({ orderBy: { createdAt: "desc" } });
}

export async function transitionItem(
  itemId: string,
  to: ItemState,
  actor: { type: string; id?: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: itemId,
      itemId,
      actorType: actor.type,
      actorId: actor.id,
      action: "item.transition",
      from: item.status as ItemState,
      to,
      assertFn: assertItemTransition,
      applyUpdate: () => tx.item.update({ where: { id: itemId }, data: { status: to } }),
    });
  });
}
