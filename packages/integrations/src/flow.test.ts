import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertOrderTransition } from "@secondcurrent/domain";
import { MockPaymentProvider } from "./payments/mock";
import { MockMessagingProvider } from "./linq/mock";
import { InlineTaskRunner } from "./render/inline";
import { MemoryObjectStorage } from "./storage/memory";
import { MOCK_SIGNATURE_HEADER, MOCK_SIGNATURE_VALID } from "./mockSignature";
import { FixtureVisionProvider } from "./vision/fixture";
import { FIXTURE_LABEL_SHA256, fixtureLabelObservation } from "./vision/fixtures";

const stripeFixtureUrl = new URL(
  "../../../fixtures/provider-events/stripe-checkout-session-completed.json",
  import.meta.url,
);

// Proves the six provider interfaces from section 15 compose into the
// "photos -> paid order -> passport" path (section 34.3 Flow A: high enough
// confidence to skip evidence requests and human review) using only mocks
// and fixtures. No provider SDK and no database is touched, matching Phase
// 2's acceptance criterion.
describe("provider-free flow: paid order to passport", () => {
  it("creates a paid order and a passport-shaped result", async () => {
    const messaging = new MockMessagingProvider();
    const payment = new MockPaymentProvider();
    const storage = new MemoryObjectStorage();
    const vision = new FixtureVisionProvider({ [FIXTURE_LABEL_SHA256]: fixtureLabelObservation });
    const tasks = new InlineTaskRunner();

    const order = { id: "order_1", itemId: "item_1", status: "CHECKOUT_CREATED" as const };

    const checkout = await payment.createCheckout({
      orderId: order.id,
      amountCents: 5_000,
      currency: "USD",
      returnUrl: "http://localhost:3000/checkout/return?orderId=order_1",
    });
    expect(checkout.checkoutSessionId).toMatch(/^mock_co_/);

    const stripeFixture = JSON.parse(readFileSync(stripeFixtureUrl, "utf8")) as {
      checkoutSessionId: string;
      orderId: string;
    };
    stripeFixture.checkoutSessionId = checkout.checkoutSessionId!;
    stripeFixture.orderId = order.id;

    const paymentEvent = await payment.verifyWebhook(
      JSON.stringify(stripeFixture),
      new Headers({ [MOCK_SIGNATURE_HEADER]: MOCK_SIGNATURE_VALID }),
    );
    expect(paymentEvent.checkoutSessionId).toBe(checkout.checkoutSessionId);

    assertOrderTransition("CHECKOUT_CREATED", "PAID");
    const paidOrder = { ...order, status: "PAID" as const };
    expect(paidOrder.status).toBe("PAID");

    const labelBytes = Buffer.from("phase-2-fixture-dell-charger-label-photo");
    expect(createHash("sha256").update(labelBytes).digest("hex")).toBe(FIXTURE_LABEL_SHA256);

    const objectKey = `items/${order.itemId}/label.jpg`;
    await storage.putPrivateObject({ objectKey, bytes: labelBytes, mimeType: "image/jpeg" });
    const signedUrl = await storage.createSignedReadUrl(objectKey, 300);
    expect(storage.resolveSignedUrl(signedUrl)).toEqual(labelBytes);

    tasks.registerTask<{ itemId: string; sha256: string }>("finalize-item", async (input) => {
      const observation = await vision.analyzeImage({
        objectKey,
        sha256: input.sha256,
        imageRole: "label",
      });
      const candidate = observation.itemCandidates[0]!;

      return {
        slug: `${input.itemId}-passport`,
        title: `${candidate.brand} ${candidate.category}`,
        category: candidate.category,
        condition: { grade: observation.condition.grade },
        suggestedNextStep: { route: "Resell", reason: "Evidence supports resale." },
        evidence: [{ label: "label", reviewedByPeople: false }],
        disclaimer:
          "This item record is based on photos and reported evidence. It is not an electrical safety test, repair diagnosis, or data wipe certificate.",
      };
    });

    const run = await tasks.start(
      "finalize-item",
      { itemId: order.itemId, sha256: FIXTURE_LABEL_SHA256 },
      `finalize:${order.itemId}:1`,
    );
    const passport = tasks.getOutput(run.runId) as {
      slug: string;
      title: string;
      category: string;
      condition: { grade: string };
      suggestedNextStep: { route: string };
      evidence: unknown[];
      disclaimer: string;
    };

    expect(passport.slug).toBe("item_1-passport");
    expect(passport.title).toBe("Dell laptop_power_adapter");
    expect(passport.suggestedNextStep.route).toBe("Resell");
    expect(passport.evidence).toHaveLength(1);
    expect(passport.disclaimer).toContain("not an electrical safety test");

    const result = await messaging.sendText({
      chatId: "chat_1",
      text: `Your item check is ready. View the item record: http://localhost:3000/item/${passport.slug}`,
      idempotencyKey: `result-ready:${order.itemId}:1`,
    });
    expect(result.providerMessageId).toMatch(/^mock_msg_/);
    expect(messaging.sent[0]!.text).toContain(passport.slug);
  });
});
