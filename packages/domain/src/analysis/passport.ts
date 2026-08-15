import type { MergedObservation } from "./merge";
import type { SafetyResult, DataRiskResult } from "./safety";
import type { PriceEstimate } from "./price";
import type { RouteDecision, ConditionGrade } from "./route";
import type { ItemClass } from "./itemClass";

// Section 19.4, exact base copy.
export const RECOVERY_PASSPORT_DISCLAIMER =
  "This item record is based on photos and reported evidence. It is not an electrical safety test, repair diagnosis, or data wipe certificate.";

const ITEM_CLASS_LABEL: Record<ItemClass, string> = {
  cable: "cable",
  power_adapter: "power adapter",
  mouse: "mouse",
  keyboard: "keyboard",
  usb_hub: "USB hub",
  headphones: "headphones",
  speaker: "speaker",
  loose_lithium_battery: "loose battery",
  swollen_battery_device: "device with a swollen battery",
  punctured_battery_device: "device with a punctured battery",
  crt_display: "CRT display",
  large_appliance: "large appliance",
  medical_device: "medical device",
  high_voltage_lab_equipment: "lab equipment",
  unknown: "item",
};

export type PassportFields = {
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  connector: string | null;
  powerText: string | null;
  conditionGrade: ConditionGrade;
  identityConfidence: number;
  safetyStatus: SafetyResult["status"];
  dataRisk: "CLEAR" | "BLOCKED";
  recommendedRoute: RouteDecision["route"];
  suggestedPriceCents: number | null;
  knownFacts: string[];
  unknownFacts: string[];
  disclaimer: string;
};

function formatPowerText(power: MergedObservation["power"]): string | null {
  if (power.sourceText) {
    return power.sourceText;
  }
  const parts: string[] = [];
  if (power.volts) parts.push(`${power.volts}V`);
  if (power.amps) parts.push(`${power.amps}A`);
  if (power.watts) parts.push(`${power.watts}W`);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function buildPassportFields(input: {
  merged: MergedObservation;
  itemClass: ItemClass;
  safety: SafetyResult;
  dataRisk: DataRiskResult;
  price: PriceEstimate | null;
  route: RouteDecision;
}): PassportFields {
  const { merged, itemClass, safety, dataRisk, price, route } = input;
  const powerText = formatPowerText(merged.power);

  const known: string[] = [];
  const unknown: string[] = [];
  if (merged.identity.brand) known.push(`The brand is ${merged.identity.brand}.`);
  else unknown.push("The brand is not confirmed.");
  if (merged.identity.model) known.push(`The model is ${merged.identity.model}.`);
  else unknown.push("The model is not confirmed.");
  if (merged.identity.connector) known.push(`The connector is ${merged.identity.connector}.`);
  else unknown.push("The connector is not confirmed.");
  if (powerText) known.push(`The power rating is ${powerText}.`);
  else unknown.push("The power rating is not confirmed.");

  const title = merged.identity.brand
    ? `${merged.identity.brand} ${ITEM_CLASS_LABEL[itemClass]}`
    : ITEM_CLASS_LABEL[itemClass];

  return {
    title,
    brand: merged.identity.brand,
    model: merged.identity.model,
    category: itemClass,
    connector: merged.identity.connector,
    powerText,
    conditionGrade: merged.condition.grade,
    identityConfidence: merged.identity.confidence,
    safetyStatus: safety.status,
    dataRisk: dataRisk.blocking ? "BLOCKED" : "CLEAR",
    recommendedRoute: route.route,
    suggestedPriceCents: price?.quotedCents ?? null,
    knownFacts: known,
    unknownFacts: unknown,
    disclaimer: RECOVERY_PASSPORT_DISCLAIMER,
  };
}
