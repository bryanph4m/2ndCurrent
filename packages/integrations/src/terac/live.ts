import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookVerificationError } from "../errors";
import type {
  CreateHumanReviewInput,
  HumanReviewDraft,
  HumanReviewProvider,
  HumanReviewSubmission,
  VerifiedReviewEvent,
} from "./types";

// Section 16.5, verbatim.
export function verifyTeracWebhook(rawBody: string, headers: Headers, secret: string): boolean {
  const timestamp = headers.get("X-Terac-Request-Timestamp");
  const signature = headers.get("X-Terac-Request-Signature");

  if (!timestamp || !signature) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(timestamp + rawBody)
    .digest("base64");

  let left: Buffer;
  let right: Buffer;
  try {
    left = Buffer.from(expected, "base64");
    right = Buffer.from(signature, "base64");
  } catch {
    return false;
  }

  return left.length === right.length && timingSafeEqual(left, right);
}

const REVIEW_STATUSES = new Set(["approved", "rejected", "received"]);

function normalizeStatus(raw: string): VerifiedReviewEvent["status"] {
  return REVIEW_STATUSES.has(raw) ? (raw as VerifiedReviewEvent["status"]) : "received";
}

// Section 22.1: no official Terac SDK exists, so this calls the REST API
// directly. "If the exact provider schema differs, update only the adapter
// and its contract tests" - the create-draft body and response field names
// below are the doc's best specification without a live account to confirm
// against; live-mode field names are the one thing here that could be wrong.
export class TeracHumanReviewProvider implements HumanReviewProvider {
  constructor(
    private readonly deps: {
      apiKey: string;
      apiBase: string;
      projectId: string;
      webhookSecret: string;
    },
  ) {}

  async createDraft(input: CreateHumanReviewInput): Promise<HumanReviewDraft> {
    const response = await fetch(`${this.deps.apiBase}/opportunities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.deps.apiKey}` },
      body: JSON.stringify({
        title: input.title,
        internal_title: input.internalTitle,
        description: "Review item photos and answer short questions about visible details.",
        project_id: this.deps.projectId,
        num_participants: input.numParticipants,
        business_type: "b2c",
        unrestricted_audience: true,
        screening_questions: [
          {
            key: "can_view_images",
            text: "Can you view clear product photos on this device?",
            pick: "one",
            answers: [
              { text: "Yes", qualify_logic: "must" },
              { text: "No", qualify_logic: "reject" },
            ],
            min_qualifying: 1,
          },
        ],
        tasks: [
          {
            sequence: 1,
            task_type: "activity",
            review_type: "auto_approve",
            task_url: input.taskUrl,
            title: input.title,
            description: "Look at the photos and answer six short questions.",
            duration_minutes: 5,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Terac createDraft failed with status ${response.status}`);
    }
    const body = (await response.json()) as { id: string; quoted_cost_cents?: number };
    return { externalOpportunityId: body.id, quotedCostCents: body.quoted_cost_cents ?? 0 };
  }

  async launch(externalOpportunityId: string): Promise<void> {
    const response = await fetch(
      `${this.deps.apiBase}/opportunities/${externalOpportunityId}/launch`,
      { method: "POST", headers: { Authorization: `Bearer ${this.deps.apiKey}` } },
    );
    if (!response.ok) {
      throw new Error(`Terac launch failed with status ${response.status}`);
    }
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedReviewEvent> {
    if (!verifyTeracWebhook(rawBody, headers, this.deps.webhookSecret)) {
      throw new WebhookVerificationError("terac", "missing or invalid signature header");
    }

    const raw = JSON.parse(rawBody) as {
      type: string;
      opportunity_id: string;
      submission_id: string;
      status: string;
    };
    const eventId = headers.get("X-Event-ID");
    if (!eventId) {
      throw new WebhookVerificationError("terac", "missing X-Event-ID header");
    }

    return {
      eventId,
      type: raw.type,
      externalOpportunityId: raw.opportunity_id,
      externalSubmissionId: raw.submission_id,
      status: normalizeStatus(raw.status),
      raw,
    };
  }

  async listSubmissions(externalOpportunityId: string): Promise<HumanReviewSubmission[]> {
    const response = await fetch(
      `${this.deps.apiBase}/opportunities/${externalOpportunityId}/submissions`,
      { headers: { Authorization: `Bearer ${this.deps.apiKey}` } },
    );
    if (!response.ok) {
      throw new Error(`Terac listSubmissions failed with status ${response.status}`);
    }
    const body = (await response.json()) as {
      submissions: Array<{ id: string; answers: Record<string, unknown> }>;
    };
    return body.submissions.map((submission) => ({
      externalSubmissionId: submission.id,
      answers: submission.answers,
    }));
  }
}
