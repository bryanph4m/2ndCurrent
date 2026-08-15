import type { Prisma } from "../generated/prisma/client";

export type TransitionAuditInput<TState extends string> = {
  tx: Prisma.TransactionClient;
  entityType: string;
  entityId: string;
  itemId?: string | null;
  actorType: string;
  actorId?: string | null | undefined;
  action: string;
  from: TState;
  to: TState;
  assertFn: (from: TState, to: TState) => void;
  applyUpdate: () => Promise<unknown>;
};

// Validates the transition, applies it, and writes the audit event in the
// same transaction so a status change can never exist without its record.
export async function transitionWithAudit<TState extends string>(
  input: TransitionAuditInput<TState>,
): Promise<void> {
  input.assertFn(input.from, input.to);
  await input.applyUpdate();
  await input.tx.auditEvent.create({
    data: {
      itemId: input.itemId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: { status: input.from },
      after: { status: input.to },
    },
  });
}
