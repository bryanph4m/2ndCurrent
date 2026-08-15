import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    outboxMessage: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../client", () => ({ db: dbMock }));

const { markOutboxFailed } = await import("./outboxRepository");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.$transaction.mockImplementation(async (callback: (tx: typeof dbMock) => unknown) =>
    callback(dbMock),
  );
  dbMock.outboxMessage.update.mockResolvedValue({});
  dbMock.auditEvent.create.mockResolvedValue({});
});

describe("markOutboxFailed", () => {
  it("schedules the documented backoff after a retryable failure", async () => {
    const now = new Date("2026-08-15T00:00:00.000Z");

    await expect(markOutboxFailed("outbox_1", "provider unavailable", 0, now)).resolves.toEqual({
      deadLettered: false,
    });

    expect(dbMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: "outbox_1" },
      data: {
        attemptCount: { increment: 1 },
        lastError: "provider unavailable",
        nextAttemptAt: new Date("2026-08-15T00:00:05.000Z"),
      },
    });
    expect(dbMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("dead-letters and audits the fifth failed attempt", async () => {
    await expect(markOutboxFailed("outbox_1", "still unavailable", 4)).resolves.toEqual({
      deadLettered: true,
    });

    expect(dbMock.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: "outbox_1" },
      data: {
        status: "FAILED",
        attemptCount: { increment: 1 },
        lastError: "still unavailable",
      },
    });
    expect(dbMock.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "outbox.dead_lettered",
        entityId: "outbox_1",
        after: { status: "FAILED", attemptCount: 5 },
      }),
    });
  });
});
