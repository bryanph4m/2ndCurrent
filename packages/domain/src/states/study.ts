import { assertTransition } from "../services/transitions";

export type StudyState =
  | "DRAFT"
  | "CREATED_AT_PROVIDER"
  | "LAUNCHED"
  | "COLLECTING"
  | "READY_TO_AGGREGATE"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";

export const STUDY_TRANSITIONS: Record<StudyState, readonly StudyState[]> = {
  DRAFT: ["CREATED_AT_PROVIDER", "CANCELED"],
  CREATED_AT_PROVIDER: ["LAUNCHED", "FAILED", "CANCELED"],
  LAUNCHED: ["COLLECTING", "FAILED", "CANCELED"],
  COLLECTING: ["READY_TO_AGGREGATE", "FAILED", "CANCELED"],
  READY_TO_AGGREGATE: ["COMPLETED", "CANCELED"],
  COMPLETED: [],
  FAILED: [],
  CANCELED: [],
};

export function assertStudyTransition(from: StudyState, to: StudyState): void {
  assertTransition("ReviewStudy", STUDY_TRANSITIONS, from, to);
}
