import { z } from "zod";

// Architecture doc section 18.1, verbatim. This is the runtime boundary the
// prompt-injection rule in section 31.5 depends on: model output is only
// trusted after it parses against this schema.
export const ImageObservationSchema = z.object({
  imageRole: z.enum(["full_item", "connector", "label", "damage", "other"]),
  observedText: z.array(z.string().max(200)).max(30),
  itemCandidates: z
    .array(
      z.object({
        brand: z.string().max(80).nullable(),
        model: z.string().max(120).nullable(),
        category: z.string().max(80),
        connector: z.string().max(80).nullable(),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string().max(200)).max(10),
      }),
    )
    .max(3),
  power: z.object({
    volts: z.number().positive().nullable(),
    amps: z.number().positive().nullable(),
    watts: z.number().positive().nullable(),
    polarity: z.string().max(40).nullable(),
    sourceText: z.string().max(200).nullable(),
  }),
  condition: z.object({
    grade: z.enum(["A", "B", "C", "D", "UNKNOWN"]),
    observations: z.array(z.string().max(200)).max(10),
  }),
  safetySignals: z.object({
    batteryVisible: z.boolean(),
    batterySwellingVisible: z.boolean(),
    exposedWireVisible: z.boolean(),
    burnMarkVisible: z.boolean(),
    crackedMainsHousingVisible: z.boolean(),
    liquidDamageVisible: z.boolean(),
    unknownPowerLabel: z.boolean(),
    notes: z.array(z.string().max(200)).max(10),
  }),
  dataRisk: z.object({
    likelyDataBearing: z.boolean(),
    screenShowsPersonalData: z.boolean(),
    activationLockRisk: z.boolean(),
    notes: z.array(z.string().max(200)).max(10),
  }),
  missingViews: z.array(
    z.enum(["full_item", "connector", "label", "serial_redacted", "power_on", "damage_closeup"]),
  ),
  uncertaintyNotes: z.array(z.string().max(200)).max(10),
});

export type ImageObservation = z.infer<typeof ImageObservationSchema>;
