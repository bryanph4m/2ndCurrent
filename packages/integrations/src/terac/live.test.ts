import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookVerificationError } from "../errors";
import { TeracHumanReviewProvider, verifyTeracWebhook } from "./live";

const SECRET = "test-webhook-secret";

function signedHeaders(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): Headers {
  const signature = createHmac("sha256", SECRET).update(`${timestamp}${rawBody}`).digest("base64");
  return new Headers({
    "X-Terac-Request-Timestamp": String(timestamp),
    "X-Terac-Request-Signature": signature,
    "X-Event-ID": "evt_terac_1",
  });
}

describe("verifyTeracWebhook", () => {
  it("accepts a correctly signed, fresh request", () => {
    const body = JSON.stringify({ status: "approved" });
    expect(verifyTeracWebhook(body, signedHeaders(body), SECRET)).toBe(true);
  });

  it("rejects a request signed with the wrong secret", () => {
    const body = JSON.stringify({ status: "approved" });
    const timestamp = Math.floor(Date.now() / 1000);
    const wrongSignature = createHmac("sha256", "other-secret")
      .update(`${timestamp}${body}`)
      .digest("base64");
    const headers = new Headers({
      "X-Terac-Request-Timestamp": String(timestamp),
      "X-Terac-Request-Signature": wrongSignature,
    });
    expect(verifyTeracWebhook(body, headers, SECRET)).toBe(false);
  });

  it("rejects a stale timestamp", () => {
    const body = JSON.stringify({ status: "approved" });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600;
    expect(verifyTeracWebhook(body, signedHeaders(body, staleTimestamp), SECRET)).toBe(false);
  });

  it("rejects a request missing the signature headers", () => {
    expect(verifyTeracWebhook("{}", new Headers(), SECRET)).toBe(false);
  });
});

describe("TeracHumanReviewProvider.verifyWebhook", () => {
  it("throws a WebhookVerificationError for an invalid signature", async () => {
    const provider = new TeracHumanReviewProvider({
      apiKey: "key",
      apiBase: "https://terac.example/api/external/v2",
      projectId: "proj_1",
      webhookSecret: SECRET,
    });

    await expect(provider.verifyWebhook("{}", new Headers())).rejects.toThrow(
      WebhookVerificationError,
    );
  });

  it("maps a validly signed approval event", async () => {
    const provider = new TeracHumanReviewProvider({
      apiKey: "key",
      apiBase: "https://terac.example/api/external/v2",
      projectId: "proj_1",
      webhookSecret: SECRET,
    });
    const body = JSON.stringify({
      type: "submission.status_changed",
      opportunity_id: "opp_1",
      submission_id: "sub_1",
      status: "approved",
    });

    const event = await provider.verifyWebhook(body, signedHeaders(body));

    expect(event).toMatchObject({
      eventId: "evt_terac_1",
      externalOpportunityId: "opp_1",
      externalSubmissionId: "sub_1",
      status: "approved",
    });
  });
});

describe("TeracHumanReviewProvider REST calls", () => {
  const provider = new TeracHumanReviewProvider({
    apiKey: "key",
    apiBase: "https://terac.example/api/external/v2",
    projectId: "proj_1",
    webhookSecret: SECRET,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a draft opportunity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "opp_1", quoted_cost_cents: 1500 }),
      }),
    );

    const draft = await provider.createDraft({
      title: "Review an electronics item",
      internalTitle: "SecondCurrent item verification item_1",
      numParticipants: 3,
      taskUrl: "http://localhost:3000/study/tok_1",
    });

    expect(draft).toEqual({ externalOpportunityId: "opp_1", quotedCostCents: 1500 });
    vi.unstubAllGlobals();
  });

  it("throws when the create-draft call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(
      provider.createDraft({
        title: "t",
        internalTitle: "t",
        numParticipants: 3,
        taskUrl: "http://localhost:3000/study/tok_1",
      }),
    ).rejects.toThrow("status 500");
    vi.unstubAllGlobals();
  });
});
