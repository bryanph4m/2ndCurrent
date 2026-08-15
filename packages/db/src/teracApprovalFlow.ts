import {
  findStudyByExternalOpportunityId,
  incrementApprovedResponses,
  transitionStudy,
} from "./repositories/reviewStudyRepository";
import { upsertResponseStatus } from "./repositories/reviewResponseRepository";

export type ProcessTeracApprovalResult =
  | { outcome: "STUDY_NOT_FOUND" }
  | { outcome: "IGNORED" }
  | { outcome: "COUNTED"; studyId: string; itemId: string | null; readyToAggregate: boolean };

// Section 17.3's "Resume from Terac" steps 1-5: resolve the ReviewStudy by
// external opportunity ID (step 1's other option, submission ID, cannot work
// here - a response row keyed by submission ID may not exist yet, see
// upsertResponseStatus), record the response status, and for an approval,
// atomically increment the study's approvedResponses (reviewStudyRepository
// docs why this must be an atomic increment, not read-then-write) and move
// the study to READY_TO_AGGREGATE the moment the target is met. Step 6
// (start finalize-item with a unique key) is the caller's job - this
// function never touches a TaskRunner, matching every other DB-layer flow
// in this codebase.
export async function processTeracApproval(event: {
  status: "approved" | "rejected" | "received";
  externalOpportunityId: string;
  externalSubmissionId: string;
}): Promise<ProcessTeracApprovalResult> {
  if (event.status === "received") {
    return { outcome: "IGNORED" };
  }

  const study = await findStudyByExternalOpportunityId(event.externalOpportunityId);
  if (!study) {
    return { outcome: "STUDY_NOT_FOUND" };
  }

  if (event.status === "rejected") {
    await upsertResponseStatus({
      studyId: study.id,
      externalSubmissionId: event.externalSubmissionId,
      status: "REJECTED",
    });
    return { outcome: "IGNORED" };
  }

  const response = await upsertResponseStatus({
    studyId: study.id,
    externalSubmissionId: event.externalSubmissionId,
    status: "APPROVED",
  });

  const updated = response.statusChanged ? await incrementApprovedResponses(study.id) : study;
  const readyToAggregate = updated.approvedResponses >= updated.targetParticipants;

  if (readyToAggregate && updated.status === "COLLECTING") {
    await transitionStudy(study.id, "READY_TO_AGGREGATE");
  }

  return { outcome: "COUNTED", studyId: updated.id, itemId: updated.itemId, readyToAggregate };
}
