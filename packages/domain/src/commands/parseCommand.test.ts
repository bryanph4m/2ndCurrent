import { describe, expect, it } from "vitest";
import { parseCommand } from "./parseCommand";

describe("parseCommand", () => {
  it("recognizes SELL case-insensitively and trimmed", () => {
    expect(parseCommand(" sell ")).toEqual({ type: "SELL" });
    expect(parseCommand("Sell")).toEqual({ type: "SELL" });
  });

  it("recognizes the fixed single-word commands", () => {
    expect(parseCommand("status")).toEqual({ type: "STATUS" });
    expect(parseCommand("yes")).toEqual({ type: "YES" });
    expect(parseCommand("no")).toEqual({ type: "NO" });
    expect(parseCommand("approve")).toEqual({ type: "APPROVE" });
    expect(parseCommand("decline")).toEqual({ type: "DECLINE" });
    expect(parseCommand("help")).toEqual({ type: "HELP" });
  });

  it("parses NEED with the trailing description", () => {
    expect(parseCommand("need 65W USB-C charger")).toEqual({
      type: "NEED",
      description: "65W USB-C charger",
    });
  });

  it("parses DONE with the trailing code", () => {
    expect(parseCommand("DONE ab12cd")).toEqual({ type: "DONE", code: "ab12cd" });
  });

  it("falls back to UNKNOWN for unrecognized text", () => {
    expect(parseCommand("what is this")).toEqual({ type: "UNKNOWN", text: "what is this" });
  });

  it("does not treat a word merely containing a command as that command", () => {
    expect(parseCommand("SELLING")).toEqual({ type: "UNKNOWN", text: "SELLING" });
  });
});
