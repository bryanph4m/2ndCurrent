const EXACT_CASE_SENSITIVE_KEYWORDS = ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];

// Section 23.3 lists the keyword set; the exact matching rule below follows
// the Linq platform's own documented behavior (see the ChatHandle health
// status docs in @linqapp/sdk): the keyword must be the WHOLE trimmed
// message, not a substring ("please stop" does not count), and matching is
// case-sensitive except for "opt out" variants, which match in any casing
// and with or without a space or hyphen. Matching this exactly keeps our
// OPTED_OUT state in sync with what Linq itself already enforces at the
// delivery level.
export function isOptOutText(text: string): boolean {
  const trimmed = text.trim();
  if (EXACT_CASE_SENSITIVE_KEYWORDS.includes(trimmed)) {
    return true;
  }
  return trimmed.toUpperCase().replace(/[\s-]/g, "") === "OPTOUT";
}
