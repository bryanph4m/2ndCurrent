import { describe, expect, it, vi } from "vitest";
import { InvalidTransitionError } from "@secondcurrent/domain";
import { transitionWithAudit } from "./audit";
import type { Prisma } from "../generated/prisma/client";

function fakeTx(): { tx: Prisma.TransactionClient; created: unknown[] } {
  const created: unknown[] = [];
  const tx = {
    auditEvent: {
      create: (args: { data: unknown }) => {
        created.push(args.data);
        return Promise.resolve(args.data);
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, created };
}

describe("transitionWithAudit", () => {
  it("throws on an invalid transition and never calls applyUpdate", async () => {
    const { tx } = fakeTx();
    const applyUpdate = vi.fn();
    const assertFn = () => {
      throw new InvalidTransitionError("Item", "READY", "INTAKE");
    };

    await expect(
      transitionWithAudit({
        tx,
        entityType: "Item",
        entityId: "item_1",
        actorType: "system",
        action: "item.transition",
        from: "READY",
        to: "INTAKE",
        assertFn,
        applyUpdate,
      }),
    ).rejects.toThrow(InvalidTransitionError);

    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it("applies the update then writes exactly one audit event", async () => {
    const { tx, created } = fakeTx();
    const applyUpdate = vi.fn().mockResolvedValue(undefined);

    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: "item_1",
      itemId: "item_1",
      actorType: "system",
      action: "item.transition",
      from: "INTAKE",
      to: "WAITING_FOR_PAYMENT",
      assertFn: () => undefined,
      applyUpdate,
    });

    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      entityType: "Item",
      entityId: "item_1",
      before: { status: "INTAKE" },
      after: { status: "WAITING_FOR_PAYMENT" },
    });
  });

  it("stores a missing actorId as null", async () => {
    const { tx, created } = fakeTx();

    await transitionWithAudit({
      tx,
      entityType: "Item",
      entityId: "item_1",
      actorType: "system",
      actorId: undefined,
      action: "item.transition",
      from: "INTAKE",
      to: "WAITING_FOR_PAYMENT",
      assertFn: () => undefined,
      applyUpdate: () => Promise.resolve(),
    });

    expect(created[0]).toMatchObject({ actorId: null });
  });
});
