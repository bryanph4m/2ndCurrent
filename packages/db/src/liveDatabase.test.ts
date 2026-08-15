import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
const live = process.env.DB_LIVE_SMOKE === "true" ? describe : describe.skip;

live("live database smoke", () => {
  let disconnect: (() => Promise<void>) | undefined;

  afterAll(async () => disconnect?.());

  it("seeds twice without duplicates and exposes the listed demo charger", async () => {
    const [{ seedDatabase }, { db }, { confirmHandoff }, { createAndLaunchItemStudy }] =
      await Promise.all([
        import("./seed"),
        import("./client"),
        import("./marketplaceFlow"),
        import("./reviewStudyFlow"),
      ]);
    disconnect = () => db.$disconnect();
    await seedDatabase();
    await seedDatabase();

    expect(await db.contact.count({ where: { id: "seed-contact-seller" } })).toBe(1);
    expect(await db.item.count({ where: { id: "seed-item-dell-65w" } })).toBe(1);
    expect(await db.serviceOrder.count({ where: { id: "seed-order-recovery-check" } })).toBe(1);
    const item = await db.item.findUniqueOrThrow({
      where: { id: "seed-item-dell-65w" },
      include: { passport: true, listing: true },
    });
    expect(item.status).toBe("LISTED");
    expect(item.passport?.safetyStatus).toBe("CLEAR");
    expect(item.listing?.status).toBe("ACTIVE");

    await db.item.create({
      data: {
        id: "smoke-review-item",
        publicId: "smoke-review-item",
        ownerContactId: "seed-contact-seller",
        status: "WAITING_FOR_REVIEW",
        activePolicyVersion: "passport.v1",
      },
    });
    await db.serviceOrder.create({
      data: {
        id: "smoke-review-order",
        contactId: "seed-contact-seller",
        itemId: "smoke-review-item",
        productCode: "RECOVERY_CHECK_SINGLE",
        status: "PAID",
        amountCents: 5_000,
        humanBudgetCents: 500,
        paidAt: new Date(),
      },
    });
    await db.analysisRun.create({
      data: {
        id: "smoke-review-analysis",
        itemId: "smoke-review-item",
        version: 1,
        status: "WAITING_FOR_REVIEW",
        modelProvider: "fixture",
        modelName: "fixture",
        promptVersion: "v1",
        policyVersion: "passport.v1",
        inputHash: "smoke-review",
        reviewDecision: {
          required: true,
          participantCount: 3,
          reasonCodes: ["LOW_CONFIDENCE"],
          maximumCostCents: 500,
        },
      },
    });
    const review = await createAndLaunchItemStudy("smoke-review-item", {
      createDraft: async () => ({
        externalOpportunityId: "smoke-review-opportunity",
        quotedCostCents: 300,
      }),
      launch: async () => undefined,
      appBaseUrl: "http://localhost:3000",
    });
    expect(review.outcome).toBe("LAUNCHED");
    await createAndLaunchItemStudy("smoke-review-item", {
      createDraft: async () => {
        throw new Error("The existing study must be reused");
      },
      launch: async () => undefined,
      appBaseUrl: "http://localhost:3000",
    });
    expect(
      await db.ledgerEntry.count({
        where: { id: `human-review-cost:${"studyId" in review ? review.studyId : "missing"}` },
      }),
    ).toBe(1);
    expect(
      await db.reviewStudy.findUniqueOrThrow({
        where: { id: "studyId" in review ? review.studyId : "missing" },
      }),
    ).toMatchObject({ actualCostCents: 300 });

    await db.contact.create({
      data: {
        id: "smoke-contact-buyer",
        phoneHash: "smoke-contact-buyer-hash",
        phoneCiphertext: "smoke-contact-buyer-ciphertext",
      },
    });
    const demand = await db.demandRequest.create({
      data: {
        id: "smoke-demand",
        contactId: "smoke-contact-buyer",
        status: "MATCHED",
        rawText: "NEED 65W USB-C CHARGER",
        structuredQuery: { category: "laptop_power_adapter" },
        locationCode: "LOCAL",
      },
    });
    await db.item.update({ where: { id: item.id }, data: { status: "RESERVED" } });
    await db.listing.update({
      where: { id: item.listing!.id },
      data: { status: "RESERVED" },
    });
    const sellerCode = "SELLER1";
    const buyerCode = "BUYER1";
    const codeHash = (code: string) => createHash("sha256").update(code).digest("hex");
    const match = await db.match.create({
      data: {
        id: "smoke-match",
        listingId: item.listing!.id,
        demandRequestId: demand.id,
        status: "ACCEPTED",
        score: 100,
        reasonCodes: ["CATEGORY", "CONNECTOR", "POWER", "LOCATION"],
        sellerCodeHash: codeHash(sellerCode),
        buyerCodeHash: codeHash(buyerCode),
      },
    });

    const confirmations = await Promise.all([
      confirmHandoff("seed-contact-seller", sellerCode),
      confirmHandoff("smoke-contact-buyer", buyerCode),
    ]);
    expect(confirmations.map((result) => result.outcome).sort()).toEqual([
      "HANDOFF_COMPLETED",
      "HANDOFF_WAITING",
    ]);
    expect(await db.match.findUniqueOrThrow({ where: { id: match.id } })).toMatchObject({
      status: "COMPLETED",
      sellerConfirmedAt: expect.any(Date),
      buyerConfirmedAt: expect.any(Date),
    });
    expect(await db.impactEvent.count({ where: { itemId: item.id, type: "LOCAL_HANDOFF" } })).toBe(
      1,
    );
  });
});
