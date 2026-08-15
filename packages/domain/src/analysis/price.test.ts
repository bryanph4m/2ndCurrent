import { describe, expect, it } from "vitest";
import { estimateRouteValue, type PriceCatalogEntry } from "./price";

const catalog: PriceCatalogEntry[] = [
  {
    category: "power_adapter",
    brand: "Dell",
    connector: "usb_c",
    lowCents: 800,
    midCents: 1200,
    highCents: 1600,
  },
];

describe("estimateRouteValue", () => {
  it("quotes the midpoint for grade A or B", () => {
    const result = estimateRouteValue(
      {
        itemClass: "power_adapter",
        brand: "Dell",
        connector: "usb_c",
        conditionGrade: "B",
        identityConfidence: 0.9,
      },
      catalog,
    );
    expect(result?.quotedCents).toBe(1200);
  });

  it("reduces one band (quotes the low price) for grade C", () => {
    const result = estimateRouteValue(
      {
        itemClass: "power_adapter",
        brand: "Dell",
        connector: "usb_c",
        conditionGrade: "C",
        identityConfidence: 0.9,
      },
      catalog,
    );
    expect(result?.quotedCents).toBe(800);
  });

  it("does not price a low-confidence identity", () => {
    const result = estimateRouteValue(
      {
        itemClass: "power_adapter",
        brand: "Dell",
        connector: "usb_c",
        conditionGrade: "B",
        identityConfidence: 0.5,
      },
      catalog,
    );
    expect(result).toBeNull();
  });

  it("does not price grade D or unknown condition", () => {
    expect(
      estimateRouteValue(
        {
          itemClass: "power_adapter",
          brand: "Dell",
          connector: "usb_c",
          conditionGrade: "D",
          identityConfidence: 0.9,
        },
        catalog,
      ),
    ).toBeNull();
    expect(
      estimateRouteValue(
        {
          itemClass: "power_adapter",
          brand: "Dell",
          connector: "usb_c",
          conditionGrade: "UNKNOWN",
          identityConfidence: 0.9,
        },
        catalog,
      ),
    ).toBeNull();
  });

  it("returns null when no catalog entry matches the item class", () => {
    const result = estimateRouteValue(
      {
        itemClass: "mouse",
        brand: null,
        connector: null,
        conditionGrade: "B",
        identityConfidence: 0.9,
      },
      catalog,
    );
    expect(result).toBeNull();
  });
});
