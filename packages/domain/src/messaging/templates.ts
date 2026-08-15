// Section 23.4: outbound copy lives here as tested constants, not generated
// by a model. Only the templates Phase 3/4 actually send are defined; the
// rest of the required set (payment received, analysis started, human review
// started, result ready, listing approval, buyer match, handoff code,
// technical error) is added with the phase that first sends it.
export const CONSENT_AND_PHOTO_INSTRUCTIONS_TEXT = [
  "Thanks for texting SecondCurrent. We check your photos and text back what the item is worth and what to do with it next.",
  "",
  "Send three photos:",
  "1. The full item",
  "2. The connector or ports",
  "3. The label or model number",
  "",
  "Use good lighting and send one item per photo. Do not include private messages, account screens, or personal documents in the photos.",
  "",
  "After we get all three, we will text a link to pay for the check.",
].join("\n");

export const CHECKOUT_LINK_PREFIX = "We received your photos. Pay for the item check here: ";

export const OPT_OUT_CONFIRMATION_TEXT =
  "You will no longer receive texts from us. Reply SELL to start again.";

export const PAYMENT_RECEIVED_TEXT = "Payment received. We are checking your item now.";
export const ANALYSIS_STARTED_TEXT = "We are checking the item photos now.";
export const HUMAN_REVIEW_STARTED_TEXT =
  "The item needs a closer look. We will text you when the check is ready.";
export const RESULT_READY_PREFIX = "Your item check is ready: ";
export const LISTING_APPROVAL_TEXT =
  "Your item record is ready to list locally. Reply APPROVE to list it, or DECLINE to keep it private.";
export const LISTING_APPROVED_TEXT = "Your item is now available for a local match.";
export const LISTING_DECLINED_TEXT = "The item will stay private and will not be matched.";
export const BUYER_MATCH_PREFIX = "Local match found";
export const HANDOFF_CODE_PREFIX = "Use this handoff code when the item changes hands";
export const HANDOFF_WAITING_TEXT = "Your handoff is confirmed. Waiting for the other person.";
export const HANDOFF_COMPLETE_TEXT = "Both people confirmed the handoff. The match is complete.";
export const NO_MATCH_TEXT = "No safe local match is available yet. We will keep the request open.";
export const TECHNICAL_ERROR_TEXT =
  "We could not finish that request. Reply HELP if the problem continues.";
