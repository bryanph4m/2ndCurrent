import { describe, expect, it } from "vitest";
import { findBestMatch, parseDemandQuery, scoreListing, type MatchableListing } from "./demand";

const seededCharger: MatchableListing = {
  id: "listing_charger",
  status: "ACTIVE",
  sellerApproved: true,
  locationCode: "LOCAL",
  priceCents: 1200,
  hasReservation: false,
  itemStatus: "LISTED",
  passportPublished: true,
  safetyStatus: "CLEAR",
  dataRisk: "CLEAR",
  category: "laptop_power_adapter",
  connector: "usb_c",
  powerWatts: 65,
  brand: "Dell",
  conditionGrade: "B",
};

describe("demand matching", () => {
  it("parses a structured charger request without a model", () => {
    expect(parseDemandQuery("Dell 65W USB-C laptop charger under $20")).toEqual({
      category: "laptop_power_adapter",
      connector: "usb_c",
      minimumWatts: 65,
      brand: "Dell",
      maxPriceCents: 2000,
      locationCode: "LOCAL",
    });
  });

  it("finds the seeded charger above the send threshold", () => {
    const query = parseDemandQuery("65W USB-C laptop charger");
    expect(findBestMatch(query, [seededCharger])).toMatchObject({
      listingId: "listing_charger",
      score: 95,
    });
  });

  it("never scores an unsafe item", () => {
    const query = parseDemandQuery("65W USB-C laptop charger");
    expect(
      scoreListing(query, { ...seededCharger, id: "unsafe", safetyStatus: "DO_NOT_LIST" }),
    ).toBeNull();
  });

  it("never scores a listing before seller approval", () => {
    const query = parseDemandQuery("65W USB-C laptop charger");
    expect(scoreListing(query, { ...seededCharger, sellerApproved: false })).toBeNull();
  });
});
