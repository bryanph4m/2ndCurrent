// Section 19.1/19.2/20 name item classes with slightly different words each
// time, and the vision model's own `category` text (section 18.1) is free
// form. This is the one place that turns free text into a closed set, so
// safety, evidence, and price policy can never disagree about what an item is.
export type SupportedItemClass =
  "cable" | "power_adapter" | "mouse" | "keyboard" | "usb_hub" | "headphones" | "speaker";

export type UnsupportedItemClass =
  | "loose_lithium_battery"
  | "swollen_battery_device"
  | "punctured_battery_device"
  | "crt_display"
  | "large_appliance"
  | "medical_device"
  | "high_voltage_lab_equipment";

export type ItemClass = SupportedItemClass | UnsupportedItemClass | "unknown";

// ponytail: substring keyword match on the model's free-text category, not a
// classifier. Checked in this order so specific/high-risk phrases win over
// generic ones (e.g. "swollen battery pack" matches swollen_battery_device,
// not a generic battery-adjacent supported class).
const CLASS_KEYWORDS: ReadonlyArray<readonly [ItemClass, readonly string[]]> = [
  ["swollen_battery_device", ["swollen battery", "swollen lithium", "battery swelling"]],
  ["punctured_battery_device", ["punctured battery", "pierced battery"]],
  ["loose_lithium_battery", ["loose battery", "loose lithium", "bare battery", "battery cell"]],
  ["crt_display", ["crt", "cathode ray"]],
  ["large_appliance", ["refrigerator", "washing machine", "dryer", "large appliance"]],
  ["medical_device", ["medical device", "defibrillator", "infusion pump"]],
  ["high_voltage_lab_equipment", ["lab equipment", "high voltage", "high-voltage"]],
  ["cable", ["cable", "cord"]],
  ["power_adapter", ["power adapter", "charger", "power supply", "psu"]],
  ["usb_hub", ["usb hub", "hub"]],
  ["mouse", ["mouse"]],
  ["keyboard", ["keyboard"]],
  ["headphones", ["headphone", "earbud", "headset"]],
  ["speaker", ["speaker"]],
];

export function normalizeItemClass(rawCategory: string | null | undefined): ItemClass {
  // Vision model category text is sometimes snake_case ("laptop_power_adapter");
  // normalize separators to spaces so keyword phrases still match.
  const text = (rawCategory ?? "").toLowerCase().replace(/[_-]/g, " ");
  for (const [itemClass, keywords] of CLASS_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return itemClass;
    }
  }
  return "unknown";
}

const UNSUPPORTED_CLASSES: ReadonlySet<ItemClass> = new Set<ItemClass>([
  "loose_lithium_battery",
  "swollen_battery_device",
  "punctured_battery_device",
  "crt_display",
  "large_appliance",
  "medical_device",
  "high_voltage_lab_equipment",
]);

export function isUnsupportedItemClass(itemClass: ItemClass): boolean {
  return UNSUPPORTED_CLASSES.has(itemClass);
}
