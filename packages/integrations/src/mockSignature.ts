// Shared convention for every mock provider's verifyWebhook: mocks do not
// implement real crypto, so they all trust one fixed header instead. This
// lets fixtures and tests express both the success and the "bad signature"
// failure path the same way across linq/stripe/terac.
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";
export const MOCK_SIGNATURE_VALID = "valid";
