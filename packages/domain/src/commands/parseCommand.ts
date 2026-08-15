export type ParsedCommand =
  | { type: "SELL" }
  | { type: "NEED"; description: string }
  | { type: "STATUS" }
  | { type: "YES" }
  | { type: "NO" }
  | { type: "APPROVE" }
  | { type: "DECLINE" }
  | { type: "DONE"; code: string }
  | { type: "HELP" }
  | { type: "UNKNOWN"; text: string };

// Section 23.2. Only SELL and opt-out are actually acted on by the Phase 3
// intake pipeline; the rest are recognized here so the parser is complete and
// tested, but handled by their own phases (NEED/APPROVE/DECLINE -> Phase 8,
// DONE -> Phase 8 handoff, STATUS/YES/NO/HELP -> not yet wired to a reply).
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  switch (upper) {
    case "SELL":
      return { type: "SELL" };
    case "STATUS":
      return { type: "STATUS" };
    case "YES":
      return { type: "YES" };
    case "NO":
      return { type: "NO" };
    case "APPROVE":
      return { type: "APPROVE" };
    case "DECLINE":
      return { type: "DECLINE" };
    case "HELP":
      return { type: "HELP" };
  }

  if (upper.startsWith("NEED ")) {
    return { type: "NEED", description: trimmed.slice(5).trim() };
  }
  if (upper.startsWith("DONE ")) {
    return { type: "DONE", code: trimmed.slice(5).trim() };
  }

  return { type: "UNKNOWN", text: trimmed };
}
