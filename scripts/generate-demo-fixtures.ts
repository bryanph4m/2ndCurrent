import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sharp = createRequire(resolve("packages/integrations/package.json"))("sharp") as (
  input: Buffer | { create: Record<string, unknown> },
) => {
  webp(options: { quality: number }): { toBuffer(): Promise<Buffer> };
};
const prettier = createRequire(import.meta.url)("prettier") as {
  format(source: string, options: { parser: "json" }): Promise<string>;
};

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, await prettier.format(JSON.stringify(value), { parser: "json" }));
}

const items = [
  ["usb-c-cable", "USB-C cable", "cable", "usb_c", "CLEAR", "RESELL", [300, 800]],
  ["hdmi-cable", "HDMI cable", "cable", "hdmi", "CLEAR", "RESELL", [300, 900]],
  [
    "dell-65w-adapter",
    "Dell 65W USB-C power adapter",
    "laptop_power_adapter",
    "usb_c",
    "CLEAR",
    "RESELL",
    [1200, 2200],
  ],
  [
    "dell-adapter-missing-label",
    "Dell adapter with missing label",
    "laptop_power_adapter",
    "usb_c",
    "NEEDS_REVIEW",
    "NEEDS_MORE_EVIDENCE",
    null,
  ],
  [
    "ambiguous-barrel-adapter",
    "Ambiguous barrel connector adapter",
    "laptop_power_adapter",
    "barrel",
    "NEEDS_REVIEW",
    "NEEDS_MORE_EVIDENCE",
    null,
  ],
  ["usb-hub", "USB hub", "usb_hub", "usb_c", "CLEAR", "RESELL", [800, 1800]],
  ["wired-mouse", "Wired mouse", "mouse", "usb_a", "CLEAR", "DONATE", [300, 900]],
  [
    "wireless-keyboard",
    "Wireless keyboard",
    "keyboard",
    "wireless",
    "CLEAR",
    "RESELL",
    [900, 2200],
  ],
  ["headphones", "Headphones", "headphones", "3.5mm", "CLEAR", "RESELL", [1000, 3000]],
  [
    "swollen-battery-device",
    "Battery device with visible swelling",
    "battery_device",
    null,
    "DO_NOT_LIST",
    "RECYCLE",
    null,
  ],
  ["locked-phone", "Phone without wipe evidence", "phone", "usb_c", "CLEAR", "DO_NOT_LIST", null],
] as const;

const root = resolve("fixtures/demo");
await mkdir(root, { recursive: true });
for (const [slug, title, category, connector, safety, route, priceBandCents] of items) {
  const itemRoot = resolve(root, slug);
  const photoRoot = resolve(itemRoot, "photos");
  await mkdir(photoRoot, { recursive: true });
  const observations: Record<string, unknown> = {};
  const photos: Array<{ file: string; sha256: string; role: string }> = [];
  for (const [index, role] of ["full_item", "connector", "label"].entries()) {
    const svg = `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="480" fill="#17324d"/><text x="32" y="220" fill="white" font-family="sans-serif" font-size="28">${title}</text><text x="32" y="270" fill="#9de2c0" font-family="sans-serif" font-size="22">${role} fixture</text></svg>`;
    const bytes = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const file = `${String(index + 1).padStart(2, "0")}-${role}.webp`;
    await writeFile(resolve(photoRoot, file), bytes);
    photos.push({ file: `photos/${file}`, sha256, role });
    observations[sha256] = {
      imageRole: role,
      observedText: role === "label" && !slug.includes("missing-label") ? [title] : [],
      itemCandidates: [
        {
          brand: title.startsWith("Dell") ? "Dell" : null,
          model: null,
          category,
          connector,
          confidence: safety === "NEEDS_REVIEW" ? 0.55 : 0.92,
          evidence: [`${role} fixture view`],
        },
      ],
      power: {
        volts: slug === "dell-65w-adapter" ? 20 : null,
        amps: slug === "dell-65w-adapter" ? 3.25 : null,
        watts: slug === "dell-65w-adapter" ? 65 : null,
        polarity: null,
        sourceText: slug === "dell-65w-adapter" ? "20V 3.25A 65W" : null,
      },
      condition: { grade: safety === "DO_NOT_LIST" ? "D" : "B", observations: [] },
      safetySignals: {
        batteryVisible: slug === "swollen-battery-device",
        batterySwellingVisible: slug === "swollen-battery-device",
        exposedWireVisible: false,
        burnMarkVisible: false,
        crackedMainsHousingVisible: false,
        liquidDamageVisible: false,
        unknownPowerLabel: slug.includes("missing-label"),
        notes: slug === "swollen-battery-device" ? ["Visible battery swelling"] : [],
      },
      dataRisk: {
        likelyDataBearing: slug === "locked-phone",
        screenShowsPersonalData: false,
        activationLockRisk: slug === "locked-phone",
        notes: slug === "locked-phone" ? ["No wipe evidence was provided"] : [],
      },
      missingViews: slug.includes("missing-label") ? ["label"] : [],
      uncertaintyNotes: safety === "NEEDS_REVIEW" ? ["Identity needs more evidence"] : [],
    };
  }
  await writeJson(resolve(itemRoot, "ground-truth.json"), {
    slug,
    title,
    category,
    connector,
    expectedSafety: safety,
    expectedEvidence: safety === "NEEDS_REVIEW" ? "REQUEST_MORE" : "COMPLETE",
    expectedRoute: route,
    expectedDataRisk: slug === "locked-phone" ? "BLOCK" : "CLEAR",
    expectedPriceBandCents: priceBandCents,
    photos,
  });
  await writeJson(resolve(itemRoot, "fixture-vision.json"), observations);
}
console.log(`Generated ${items.length} demo items with ${items.length * 3} fixture photos`);
