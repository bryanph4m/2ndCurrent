import { describe, expect, it } from "vitest";
import { isOptOutText } from "./optOut";

describe("isOptOutText", () => {
  it("matches the exact-case keywords", () => {
    expect(isOptOutText("STOP")).toBe(true);
    expect(isOptOutText("UNSUBSCRIBE")).toBe(true);
    expect(isOptOutText("CANCEL")).toBe(true);
    expect(isOptOutText("END")).toBe(true);
    expect(isOptOutText("QUIT")).toBe(true);
  });

  it("does not match a different-case exact keyword", () => {
    expect(isOptOutText("stop")).toBe(false);
    expect(isOptOutText("Stop")).toBe(false);
  });

  it("does not match a keyword embedded in a longer message", () => {
    expect(isOptOutText("please stop")).toBe(false);
    expect(isOptOutText("STOP please")).toBe(false);
  });

  it("matches OPT OUT in any casing, with or without a space or hyphen", () => {
    expect(isOptOutText("OPTOUT")).toBe(true);
    expect(isOptOutText("optout")).toBe(true);
    expect(isOptOutText("OPT OUT")).toBe(true);
    expect(isOptOutText("opt out")).toBe(true);
    expect(isOptOutText("Opt-Out")).toBe(true);
  });

  it("does not match ordinary text", () => {
    expect(isOptOutText("SELL")).toBe(false);
    expect(isOptOutText("Hello there")).toBe(false);
  });
});
