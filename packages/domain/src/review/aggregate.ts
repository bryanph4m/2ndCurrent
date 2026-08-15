// Section 22.5's response aggregation rules, pure functions over approved
// review answers only - callers are responsible for filtering to
// ReviewResponse rows with status APPROVED before calling these.

export type CategoricalTally = {
  winner: string | null;
  winningVotes: number;
  approvedVotes: number;
  agreement: number;
  tie: boolean;
};

// "Use majority vote. Report agreement as winning votes divided by approved
// votes. Treat a tie as conflict."
export function aggregateCategorical(values: string[]): CategoricalTally {
  if (values.length === 0) {
    return { winner: null, winningVotes: 0, approvedVotes: 0, agreement: 0, tie: false };
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  const winners = [...counts.entries()]
    .filter(([, count]) => count === max)
    .map(([value]) => value);
  const tie = winners.length > 1;

  return {
    winner: tie ? null : (winners[0] ?? null),
    winningVotes: max,
    approvedVotes: values.length,
    agreement: max / values.length,
    tie,
  };
}

export type RatingSummary = {
  median: number;
  mean: number;
  distribution: Record<number, number>;
};

// "Use median as the main value. Store mean and distribution for metrics."
export function aggregateRating(values: number[]): RatingSummary {
  if (values.length === 0) {
    return { median: 0, mean: 0, distribution: {} };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const distribution: Record<number, number> = {};
  for (const value of values) {
    distribution[value] = (distribution[value] ?? 0) + 1;
  }

  return { median, mean, distribution };
}

// "Keep each answer." No model-based theme grouping - that is explicitly
// optional enrichment ("do not let the model change raw counts") and has no
// bearing on the finalize decision, so it is not implemented here.
export function collectFreeText(values: string[]): string[] {
  return values.filter((value) => value.trim().length > 0);
}
