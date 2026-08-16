import { describe, expect, it, vi } from "vitest";

const { findWebhookEventByIdMock } = vi.hoisted(() => ({
  findWebhookEventByIdMock: vi.fn(),
}));

vi.mock("@secondcurrent/db", () => ({
  findWebhookEventById: findWebhookEventByIdMock,
  createLinqIntakePorts: vi.fn(),
  sendQueuedOutboxMessages: vi.fn(),
  startTaskOnce: vi.fn(),
}));

vi.mock("@renderinc/sdk/workflows", () => ({
  task: (_options: unknown, func: unknown) => func,
}));

const { processStoredWebhook } = await import("./process-webhook");

describe("processStoredWebhook", () => {
  it("throws when the webhook event cannot be found", async () => {
    findWebhookEventByIdMock.mockResolvedValue(null);

    await expect(processStoredWebhook("missing_id")).rejects.toThrow("No WebhookEvent found");
  });

  it("throws for a non-linq event instead of silently doing nothing", async () => {
    findWebhookEventByIdMock.mockResolvedValue({ provider: "stripe", rawBody: "{}", headers: {} });

    await expect(processStoredWebhook("evt_1")).rejects.toThrow('provider "stripe"');
  });
});
