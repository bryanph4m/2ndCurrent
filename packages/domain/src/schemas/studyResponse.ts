import { z } from "zod";

// Section 16.7's request body, extended with the two section 21.4 questions
// (identity candidate, safety concern) the example didn't spell out but the
// question list requires. Reviewers answer six questions; this is those six.
export const StudyResponseAnswersSchema = z.object({
  connectorChoice: z.string().max(80),
  labelReadable: z.boolean(),
  identityCandidate: z.string().max(80),
  conditionAgreement: z.number().int().min(1).max(7),
  missingEvidence: z.array(z.string().max(80)).max(10),
  safetyConcern: z.boolean(),
  comment: z.string().max(500).optional(),
});

export type StudyResponseAnswers = z.infer<typeof StudyResponseAnswersSchema>;

export const StudyResponseRequestSchema = z
  .object({
    teracSubmissionId: z.string().min(1).optional(),
    submissionId: z.string().min(1).optional(),
    taskId: z.string().min(1),
    answers: StudyResponseAnswersSchema,
  })
  .refine((body) => Boolean(body.teracSubmissionId ?? body.submissionId), {
    message: "teracSubmissionId or submissionId is required",
  });

export type StudyResponseRequest = z.infer<typeof StudyResponseRequestSchema>;
