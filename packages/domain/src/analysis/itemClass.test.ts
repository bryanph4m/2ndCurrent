import { describe, expect, it } from "vitest";
import { isUnsupportedItemClass, normalizeItemClass } from "./itemClass";

describe("normalizeItemClass", () => {
  it("maps free-text categories to a known supported class", () => {
    expect(normalizeItemClass("laptop_power_adapter")).toBe("power_adapter");
    expect(normalizeItemClass("USB-C charger")).toBe("power_adapter");
    expect(normalizeItemClass("wired computer mouse")).toBe("mouse");
  });

  it("prefers a high-risk match over a generic one", () => {
    expect(normalizeItemClass("swollen battery power bank")).toBe("swollen_battery_device");
  });

  it("returns unknown for unrecognized text", () => {
    expect(normalizeItemClass("mystery gadget")).toBe("unknown");
    expect(normalizeItemClass(null)).toBe("unknown");
  });
});

describe("isUnsupportedItemClass", () => {
  it("flags unsupported classes only", () => {
    expect(isUnsupportedItemClass("swollen_battery_device")).toBe(true);
    expect(isUnsupportedItemClass("power_adapter")).toBe(false);
  });
});
