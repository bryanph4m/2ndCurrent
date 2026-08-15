import type { ImageObservation } from "../schemas/imageObservation";

type ConditionGrade = ImageObservation["condition"]["grade"];
type ViewLabel = ImageObservation["missingViews"][number];

export type MergedObservation = {
  observedText: string[];
  identity: {
    brand: string | null;
    model: string | null;
    category: string | null;
    connector: string | null;
    confidence: number;
    evidence: string[];
  };
  conflictCount: number;
  power: ImageObservation["power"];
  condition: { grade: ConditionGrade; observations: string[] };
  safetySignals: ImageObservation["safetySignals"];
  dataRisk: ImageObservation["dataRisk"];
  missingViews: Set<ViewLabel>;
  uncertaintyNotes: string[];
};

const GRADE_SEVERITY: Record<ConditionGrade, number> = { A: 0, B: 1, C: 2, D: 3, UNKNOWN: -1 };

function topCandidate(observation: ImageObservation) {
  return observation.itemCandidates.reduce<ImageObservation["itemCandidates"][number] | null>(
    (best, candidate) => (!best || candidate.confidence > best.confidence ? candidate : best),
    null,
  );
}

// Deterministic per section 18.3: label image wins for model/power, connector
// image wins for connector, positive safety/data-risk signals OR together and
// never disappear, a model without evidence is discarded, and merged
// confidence can never exceed the best single-image confidence.
export function mergeImageObservations(observations: ImageObservation[]): MergedObservation {
  if (observations.length === 0) {
    throw new Error("mergeImageObservations requires at least one observation");
  }

  const labelImage = observations.find((o) => o.imageRole === "label");
  const connectorImage = observations.find((o) => o.imageRole === "connector");
  const fullItemImage = observations.find((o) => o.imageRole === "full_item");

  const identitySource = labelImage ?? fullItemImage ?? observations[0]!;
  const identityCandidate = topCandidate(identitySource);

  const nonNullBrands = new Set(
    observations.map((o) => topCandidate(o)?.brand).filter((v): v is string => Boolean(v)),
  );
  const nonNullModels = new Set(
    observations.map((o) => topCandidate(o)?.model).filter((v): v is string => Boolean(v)),
  );
  const conflictCount = Math.max(0, nonNullBrands.size - 1) + Math.max(0, nonNullModels.size - 1);

  const modelHasEvidence = (identityCandidate?.evidence.length ?? 0) > 0;
  const highestConfidence = Math.max(...observations.map((o) => topCandidate(o)?.confidence ?? 0));
  const confidence = Math.max(
    0,
    Math.min(highestConfidence, (identityCandidate?.confidence ?? 0) - conflictCount * 0.15),
  );

  const connectorCandidate = topCandidate(connectorImage ?? identitySource);

  const observedText = [
    ...new Set(observations.flatMap((o) => o.observedText.map((t) => t.trim().toLowerCase()))),
  ];

  const worstCondition = observations.reduce((worst, o) =>
    GRADE_SEVERITY[o.condition.grade] > GRADE_SEVERITY[worst.condition.grade] ? o : worst,
  );

  return {
    observedText,
    identity: {
      brand: identityCandidate?.brand ?? null,
      model: modelHasEvidence ? (identityCandidate?.model ?? null) : null,
      category: identityCandidate?.category ?? null,
      connector: connectorCandidate?.connector ?? null,
      confidence,
      evidence: identityCandidate?.evidence ?? [],
    },
    conflictCount,
    power: (labelImage ?? identitySource).power,
    condition: {
      grade: worstCondition.condition.grade,
      observations: [...new Set(observations.flatMap((o) => o.condition.observations))],
    },
    safetySignals: {
      batteryVisible: observations.some((o) => o.safetySignals.batteryVisible),
      batterySwellingVisible: observations.some((o) => o.safetySignals.batterySwellingVisible),
      exposedWireVisible: observations.some((o) => o.safetySignals.exposedWireVisible),
      burnMarkVisible: observations.some((o) => o.safetySignals.burnMarkVisible),
      crackedMainsHousingVisible: observations.some(
        (o) => o.safetySignals.crackedMainsHousingVisible,
      ),
      liquidDamageVisible: observations.some((o) => o.safetySignals.liquidDamageVisible),
      unknownPowerLabel: observations.some((o) => o.safetySignals.unknownPowerLabel),
      notes: [...new Set(observations.flatMap((o) => o.safetySignals.notes))],
    },
    dataRisk: {
      likelyDataBearing: observations.some((o) => o.dataRisk.likelyDataBearing),
      screenShowsPersonalData: observations.some((o) => o.dataRisk.screenShowsPersonalData),
      activationLockRisk: observations.some((o) => o.dataRisk.activationLockRisk),
      notes: [...new Set(observations.flatMap((o) => o.dataRisk.notes))],
    },
    missingViews: new Set(observations.flatMap((o) => o.missingViews)),
    uncertaintyNotes: [...new Set(observations.flatMap((o) => o.uncertaintyNotes))],
  };
}

export function conditionGradeSpread(observations: ImageObservation[]): number {
  const severities = observations
    .map((o) => GRADE_SEVERITY[o.condition.grade])
    .filter((s) => s >= 0);
  if (severities.length === 0) {
    return 0;
  }
  return Math.max(...severities) - Math.min(...severities);
}
