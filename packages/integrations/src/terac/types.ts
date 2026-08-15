export type CreateHumanReviewInput = {
  title: string;
  internalTitle: string;
  numParticipants: number;
  taskUrl: string;
};

export type HumanReviewDraft = {
  externalOpportunityId: string;
  quotedCostCents: number;
};

export type VerifiedReviewEvent = {
  eventId: string;
  type: string;
  externalOpportunityId: string;
  externalSubmissionId: string;
  status: "approved" | "rejected" | "received";
  raw: unknown;
};

export type HumanReviewSubmission = {
  externalSubmissionId: string;
  answers: Record<string, unknown>;
};

export interface HumanReviewProvider {
  createDraft(input: CreateHumanReviewInput): Promise<HumanReviewDraft>;
  launch(externalOpportunityId: string): Promise<void>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedReviewEvent>;
  listSubmissions(externalOpportunityId: string): Promise<HumanReviewSubmission[]>;
}
