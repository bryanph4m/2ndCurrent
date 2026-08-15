import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const provider = process.argv[2];
if (!provider || !["linq", "stripe", "terac"].includes(provider)) {
  throw new Error("Usage: tsx scripts/post-provider-fixture.ts <linq|stripe|terac> [fixture-path]");
}
const defaultFile = resolve(`fixtures/provider-events/${provider}-message-received.json`);
const fallbackByProvider: Record<string, string> = {
  linq: resolve("fixtures/provider-events/linq-message-received.json"),
  stripe: resolve("fixtures/provider-events/stripe-checkout-session-completed.json"),
  terac: resolve("fixtures/provider-events/terac-submission-approved.json"),
};
const fixturePath = resolve(process.argv[3] ?? fallbackByProvider[provider] ?? defaultFile);
const payload = JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, unknown>;
payload.eventId = `${String(payload.eventId ?? "fixture")}_${Date.now()}`;
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const response = await fetch(`${baseUrl}/api/webhooks/${provider}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-mock-signature": "valid" },
  body: JSON.stringify(payload),
});
console.log(`${provider}: ${response.status} ${await response.text()}`.trim());
if (!response.ok) process.exitCode = 1;
