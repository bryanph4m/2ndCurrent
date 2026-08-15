import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    webhookEvent: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  },
}));

vi.mock("../client", () => ({ db: dbMock }));

const { claimWebhookEventForProcessing, markWebhookEventFailed } =
  await import("./webhookEventRepository");

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.auditEvent.create.mockResolvedValue({});
});

describe("webhook processing claims", () => {
  it("atomically claims only a retryable event below the attempt limit", async () => {
    dbMock.webhookEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(claimWebhookEventForProcessing("event_1")).resolves.toBe(true);
    expect(dbMock.webhookEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: "event_1",
        status: { in: ["RECEIVED", "FAILED"] },
        attemptCount: { lt: 5 },
      },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
  });

  it("records a terminal fifth failure for admin attention", async () => {
    dbMock.webhookEvent.update.mockResolvedValue({
      id: "event_1",
      provider: "linq",
      attemptCount: 5,
    });

    await markWebhookEventFailed("event_1", "provider unavailable");

    expect(dbMock.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "webhook.dead_lettered",
        entityId: "event_1",
        after: { status: "FAILED", attemptCount: 5 },
      }),
    });
  });
});
