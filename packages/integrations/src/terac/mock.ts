import { WebhookVerificationError } from "../errors";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "../mockSignature";
import type {
  CreateHumanReviewInput,
  HumanReviewDraft,
  HumanReviewProvider,
  HumanReviewSubmission,
  VerifiedReviewEvent,
} from "./types";

type Opportunity = {
  input: CreateHumanReviewInput;
  launched: boolean;
};

export class MockHumanReviewProvider implements HumanReviewProvider {
  private readonly opportunities = new Map<string, Opportunity>();
  private readonly submissions = new Map<string, HumanReviewSubmission[]>();
  private nextOpportunityId = 1;

  async createDraft(input: CreateHumanReviewInput): Promise<HumanReviewDraft> {
    const externalOpportunityId = `mock_opp_${this.nextOpportunityId++}`;
    this.opportunities.set(externalOpportunityId, { input, launched: false });
    this.submissions.set(externalOpportunityId, []);
    return { externalOpportunityId, quotedCostCents: input.numParticipants * 500 };
  }

  async launch(externalOpportunityId: string): Promise<void> {
    const opportunity = this.opportunities.get(externalOpportunityId);
    if (!opportunity) {
      throw new Error(`No mock opportunity ${externalOpportunityId}`);
    }
    opportunity.launched = true;
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedReviewEvent> {
    if (headers.get(MOCK_SIGNATURE_HEADER) !== MOCK_SIGNATURE_VALID) {
      throw new WebhookVerificationError("terac", "missing or invalid signature header");
    }

    const raw = JSON.parse(rawBody) as {
      eventId: string;
      type: string;
      externalOpportunityId: string;
      externalSubmissionId: string;
      status: "approved" | "rejected" | "received";
    };

    return {
      eventId: raw.eventId,
      type: raw.type,
      externalOpportunityId: raw.externalOpportunityId,
      externalSubmissionId: raw.externalSubmissionId,
      status: raw.status,
      raw,
    };
  }

  async listSubmissions(externalOpportunityId: string): Promise<HumanReviewSubmission[]> {
    return this.submissions.get(externalOpportunityId) ?? [];
  }

  seedSubmission(externalOpportunityId: string, submission: HumanReviewSubmission): void {
    const existing = this.submissions.get(externalOpportunityId) ?? [];
    existing.push(submission);
    this.submissions.set(externalOpportunityId, existing);
  }
}
