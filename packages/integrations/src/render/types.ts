export type TaskRunRef = {
  runId: string;
};

// Architecture doc section 15.6 declares idempotencyKey as a required
// argument, matching the idempotency key table in section 32.1 ("Start
// analysis" / "Finalize item" both need one). Section 17.1.1's example
// RenderTaskRunner and section 17.2's call sites omit it, which is a doc
// inconsistency; this interface follows 15.6 and 32.1 since dropping the key
// would make task starts non-idempotent by construction.
export interface TaskRunner {
  start<TInput>(taskName: string, input: TInput, idempotencyKey: string): Promise<TaskRunRef>;
}
