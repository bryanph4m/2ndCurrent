import { InvalidTransitionError } from "../errors/InvalidTransitionError";

export function assertTransition<TState extends string>(
  entity: string,
  transitions: Record<TState, readonly TState[]>,
  from: TState,
  to: TState,
): void {
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}
