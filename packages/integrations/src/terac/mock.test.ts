import { describe, expect, it } from "vitest";
import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import { MockHumanReviewProvider } from "./mock";

describe("MockHumanReviewProvider", () => {
  it("creates a draft and launches it", async () => {
    const provider = new MockHumanReviewProvider();
    const draft = await provider.createDraft({
      title: "Check an electronics item record",
      internalTitle: "SecondCurrent item verification item_1",
      numParticipants: 3,
      taskUrl: "http://localhost:3000/study/tok_1",
    });

    expect(draft.externalOpportunityId).toMatch(/^mock_opp_/);
    expect(draft.quotedCostCents).toBe(1500);

    await expect(provider.launch(draft.externalOpportunityId)).resolves.toBeUndefined();
  });

  it("throws when launching an unknown opportunity", async () => {
    const provider = new MockHumanReviewProvider();
    await expect(provider.launch("mock_opp_999")).rejects.toThrow();
  });

  it("rejects a webhook without a valid signature header", async () => {
    const provider = new MockHumanReviewProvider();
    const body = JSON.stringify({
      eventId: "evt_terac_1",
      type: "submission.status_changed",
      externalOpportunityId: "mock_opp_1",
      externalSubmissionId: "sub_1",
      status: "approved",
    });

    await expect(provider.verifyWebhook(body, new Headers())).rejects.toThrow(
      WebhookVerificationError,
    );
  });

  it("returns seeded submissions", async () => {
    const provider = new MockHumanReviewProvider();
    const draft = await provider.createDraft({
      title: "t",
      internalTitle: "t",
      numParticipants: 1,
      taskUrl: "http://localhost:3000/study/tok_1",
    });
    provider.seedSubmission(draft.externalOpportunityId, {
      externalSubmissionId: "sub_1",
      answers: { connectorChoice: "usb_c" },
    });

    const submissions = await provider.listSubmissions(draft.externalOpportunityId);
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({ externalSubmissionId: "sub_1" });
  });

  it("verifies a signed webhook", async () => {
    const provider = new MockHumanReviewProvider();
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_VALID });
    const body = JSON.stringify({
      eventId: "evt_terac_1",
      type: "submission.status_changed",
      externalOpportunityId: "mock_opp_1",
      externalSubmissionId: "sub_1",
      status: "approved",
    });

    const event = await provider.verifyWebhook(body, headers);
    expect(event.status).toBe("approved");
  });
});
