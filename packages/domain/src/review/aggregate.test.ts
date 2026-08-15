import { describe, expect, it } from "vitest";
import { aggregateCategorical, aggregateRating, collectFreeText } from "./aggregate";

describe("aggregateCategorical", () => {
  it("picks the majority winner and reports agreement", () => {
    const result = aggregateCategorical(["usb_c", "usb_c", "usb_a"]);
    expect(result).toEqual({
      winner: "usb_c",
      winningVotes: 2,
      approvedVotes: 3,
      agreement: 2 / 3,
      tie: false,
    });
  });

  it("treats a tie as conflict: no winner", () => {
    const result = aggregateCategorical(["usb_c", "usb_a"]);
    expect(result.tie).toBe(true);
    expect(result.winner).toBeNull();
  });

  it("handles no responses without dividing by zero", () => {
    const result = aggregateCategorical([]);
    expect(result).toEqual({
      winner: null,
      winningVotes: 0,
      approvedVotes: 0,
      agreement: 0,
      tie: false,
    });
  });
});

describe("aggregateRating", () => {
  it("uses the median as the main value and reports mean and distribution", () => {
    const result = aggregateRating([5, 6, 7]);
    expect(result.median).toBe(6);
    expect(result.mean).toBeCloseTo(6);
    expect(result.distribution).toEqual({ 5: 1, 6: 1, 7: 1 });
  });

  it("averages the two middle values for an even count", () => {
    const result = aggregateRating([4, 5, 6, 7]);
    expect(result.median).toBe(5.5);
  });
});

describe("collectFreeText", () => {
  it("keeps every non-empty answer without altering counts", () => {
    expect(collectFreeText(["clear label", "", "  ", "cable end unclear"])).toEqual([
      "clear label",
      "cable end unclear",
    ]);
  });
});
