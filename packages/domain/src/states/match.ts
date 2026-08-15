import { assertTransition } from "../services/transitions";

export type MatchState =
  "PROPOSED" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "COMPLETED" | "CANCELED";

export const MATCH_TRANSITIONS: Record<MatchState, readonly MatchState[]> = {
  PROPOSED: ["SENT"],
  SENT: ["ACCEPTED", "DECLINED", "EXPIRED"],
  ACCEPTED: ["COMPLETED", "CANCELED"],
  DECLINED: [],
  EXPIRED: [],
  COMPLETED: [],
  CANCELED: [],
};

export function assertMatchTransition(from: MatchState, to: MatchState): void {
  assertTransition("Match", MATCH_TRANSITIONS, from, to);
}
