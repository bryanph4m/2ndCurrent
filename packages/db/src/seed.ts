import { db } from "./client";

export async function seedDatabase(): Promise<void> {
  const seller = await db.contact.upsert({
    where: { phoneHash: "seed-phone-hash-1" },
    create: {
      id: "seed-contact-seller",
      phoneHash: "seed-phone-hash-1",
      phoneCiphertext: "seed-phone-ciphertext-1",
    },
    update: {},
  });

  const item = await db.item.upsert({
    where: { publicId: "demo-dell-65w" },
    create: {
      id: "seed-item-dell-65w",
      publicId: "demo-dell-65w",
      ownerContactId: seller.id,
      status: "LISTED",
      sellerDescription: "Dell laptop power adapter, 65W, USB-C",
      category: "laptop_power_adapter",
      weightGrams: 250,
      activePolicyVersion: "intake.v1",
      finalRoute: "RESELL",
    },
    update: {
      ownerContactId: seller.id,
      status: "LISTED",
      finalRoute: "RESELL",
    },
  });

  await db.serviceOrder.upsert({
    where: { id: "seed-order-recovery-check" },
    create: {
      id: "seed-order-recovery-check",
      contactId: seller.id,
      itemId: item.id,
      productCode: "RECOVERY_CHECK_SINGLE",
      status: "COMPLETED",
      amountCents: 5_000,
      paidAt: new Date(),
      completedAt: new Date(),
    },
    update: { status: "COMPLETED", paidAt: new Date(), completedAt: new Date() },
  });

  await db.recoveryPassport.upsert({
    where: { itemId: item.id },
    create: {
      itemId: item.id,
      publicSlug: item.publicId,
      title: "Dell 65W USB-C power adapter",
      brand: "Dell",
      modelName: "65W USB-C",
      category: "laptop_power_adapter",
      connector: "usb_c",
      powerText: "65W",
      conditionGrade: "B",
      identityConfidence: 0.95,
      safetyStatus: "CLEAR",
      dataRisk: "CLEAR",
      recommendedRoute: "RESELL",
      suggestedPriceCents: 1200,
      knownFacts: ["Dell brand", "USB-C connector", "65W output"],
      unknownFacts: [],
      evidenceSummary: [],
      disclaimer: "This item record is based on photos and reported evidence.",
      publishedAt: new Date(),
    },
    update: { publishedAt: new Date(), safetyStatus: "CLEAR", recommendedRoute: "RESELL" },
  });

  await db.listing.upsert({
    where: { itemId: item.id },
    create: {
      itemId: item.id,
      status: "ACTIVE",
      priceCents: 1200,
      locationCode: "LOCAL",
      sellerApprovedAt: new Date(),
    },
    update: { status: "ACTIVE", priceCents: 1200, sellerApprovedAt: new Date() },
  });

  console.log("Seeded 1 contact, 1 listed charger, 1 passport, and 1 order.");
}
