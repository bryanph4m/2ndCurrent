import {
  MeasurementResponseSchema,
  ProductChangeCodeSchema,
  assignBlindComparisonOrder,
  calculateStudyMetrics,
  type ProductChangeCode,
  type StudyMetrics,
} from "@secondcurrent/domain";
import { Prisma } from "../generated/prisma/client";
import { db } from "./client";
import { generateStudyToken, hashStudyToken } from "./repositories/reviewStudyRepository";

export type MeasurementStudyType = "PRODUCT_DIAGNOSTIC" | "BLIND_COMPARISON";

export async function createMeasurementStudy(input: {
  type: MeasurementStudyType;
  templateVersion: string;
  targetParticipants: number;
  baselinePolicyVersion: string;
  revisedPolicyVersion: string;
  randomValue?: number;
}): Promise<{ id: string; token: string; variantOrder: readonly [string, string] | null }> {
  const token = generateStudyToken();
  const variantOrder =
    input.type === "BLIND_COMPARISON"
      ? assignBlindComparisonOrder(input.randomValue ?? Math.random())
      : null;
  const configuration = {
    baselinePolicyVersion: input.baselinePolicyVersion,
    revisedPolicyVersion: input.revisedPolicyVersion,
    blind: input.type === "BLIND_COMPARISON",
    variantOrder,
  };
  const study = await db.reviewStudy.create({
    data: {
      itemId: null,
      type: input.type,
      status: "DRAFT",
      templateVersion: input.templateVersion,
      publicTokenHash: hashStudyToken(token),
      targetParticipants: input.targetParticipants,
      configuration,
    },
  });
  await db.auditEvent.create({
    data: {
      actorType: "system",
      action: "measurement_study.created",
      entityType: "ReviewStudy",
      entityId: study.id,
      after: { status: "DRAFT", type: input.type, configuration },
    },
  });
  return { id: study.id, token, variantOrder };
}

export async function recordFindingAndProductChange(input: {
  studyId: string;
  sourceResponseId?: string;
  findingCode: string;
  findingText: string;
  occurrenceCount?: number;
  changeCode: ProductChangeCode;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  appliedPolicyKey?: string;
  appliedPolicyVersion?: string;
}): Promise<{ humanFindingId: string; productChangeId: string }> {
  const changeCode = ProductChangeCodeSchema.parse(input.changeCode);
  const findingText = input.findingText.trim();
  if (!findingText) throw new Error("A product change requires a human finding");

  return db.$transaction(async (tx) => {
    if (input.sourceResponseId) {
      const response = await tx.reviewResponse.findUniqueOrThrow({
        where: { id: input.sourceResponseId },
      });
      if (response.studyId !== input.studyId) {
        throw new Error("The source response belongs to a different study");
      }
    }
    const finding = await tx.humanFinding.create({
      data: {
        studyId: input.studyId,
        sourceResponseId: input.sourceResponseId ?? null,
        code: input.findingCode,
        findingText,
        occurrenceCount: input.occurrenceCount ?? 1,
      },
    });
    const change = await tx.productChange.create({
      data: {
        studyId: input.studyId,
        humanFindingId: finding.id,
        code: changeCode,
        finding: findingText,
        ...(input.oldValue !== undefined ? { oldValue: input.oldValue } : {}),
        ...(input.newValue !== undefined ? { newValue: input.newValue } : {}),
        ...(input.appliedPolicyKey !== undefined
          ? { appliedPolicyKey: input.appliedPolicyKey }
          : {}),
        ...(input.appliedPolicyVersion !== undefined
          ? { appliedPolicyVersion: input.appliedPolicyVersion }
          : {}),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: "system",
        action: "product_change.recorded",
        entityType: "ProductChange",
        entityId: change.id,
        after: { code: changeCode, humanFindingId: finding.id },
      },
    });
    return { humanFindingId: finding.id, productChangeId: change.id };
  });
}

export async function storeStudyMetrics(input: {
  studyId: string;
  baselineResponses: readonly unknown[];
  revisedResponses: readonly unknown[];
}): Promise<{ baseline: StudyMetrics; revised: StudyMetrics }> {
  const baseline = calculateStudyMetrics(input.baselineResponses);
  const revised = calculateStudyMetrics(input.revisedResponses);
  await db.$transaction(async (tx) => {
    for (const [variant, metrics] of [
      ["BASELINE", baseline],
      ["REVISED", revised],
    ] as const) {
      await tx.metricSnapshot.upsert({
        where: { studyId_variant: { studyId: input.studyId, variant } },
        create: {
          studyId: input.studyId,
          variant,
          metrics: metrics as unknown as Prisma.InputJsonValue,
          sampleSize: metrics.sampleSize,
        },
        update: {
          metrics: metrics as unknown as Prisma.InputJsonValue,
          sampleSize: metrics.sampleSize,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorType: "system",
        action: "study_metrics.stored",
        entityType: "ReviewStudy",
        entityId: input.studyId,
        after: {
          baselineSampleSize: baseline.sampleSize,
          revisedSampleSize: revised.sampleSize,
        },
      },
    });
  });
  return { baseline, revised };
}

export async function computeStoredStudyMetrics(
  studyId: string,
): Promise<{ baseline: StudyMetrics; revised: StudyMetrics }> {
  const responses = await db.reviewResponse.findMany({
    where: { studyId, status: "APPROVED", answers: { not: Prisma.DbNull } },
  });
  const baseline: unknown[] = [];
  const revised: unknown[] = [];
  for (const response of responses) {
    const answer = response.answers as Record<string, unknown>;
    const variant = answer.variant;
    const measurement = MeasurementResponseSchema.parse(answer.measurement ?? answer);
    if (variant === "BASELINE") baseline.push(measurement);
    if (variant === "REVISED") revised.push(measurement);
  }
  return storeStudyMetrics({ studyId, baselineResponses: baseline, revisedResponses: revised });
}

export type JudgingDashboard = Awaited<ReturnType<typeof getJudgingDashboard>>;

export async function getJudgingDashboard() {
  const [
    orders,
    ledgerEntries,
    studies,
    metricSnapshots,
    productChanges,
    impactEvents,
    failedWorkflows,
    failedMessages,
    failedWebhooks,
  ] = await Promise.all([
    db.serviceOrder.findMany({ orderBy: { createdAt: "desc" } }),
    db.ledgerEntry.findMany(),
    db.reviewStudy.findMany({ orderBy: { createdAt: "desc" } }),
    db.metricSnapshot.findMany({ orderBy: { createdAt: "desc" } }),
    db.productChange.findMany({
      include: { humanFinding: true },
      orderBy: { createdAt: "desc" },
    }),
    db.impactEvent.findMany({ orderBy: { createdAt: "desc" } }),
    db.workflowRun.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.outboxMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.webhookEvent.findMany({
      where: { status: "FAILED" },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
  ]);

  const sum = (type: string) =>
    ledgerEntries
      .filter((entry) => entry.type === type)
      .reduce((total, entry) => total + entry.amountCents, 0);
  const marketCostCents = Math.abs(sum("HUMAN_REVIEW_COST")) + Math.abs(sum("MODEL_COST"));
  const sponsoredCreditCents = sum("SPONSORED_CREDIT");
  const resolvedAmbiguityStudies = studies.filter(
    (study) => study.type === "ITEM_VERIFICATION" && study.status === "COMPLETED",
  );
  const correctedItems = resolvedAmbiguityStudies.filter((study) => {
    const configuration = study.configuration as Record<string, unknown>;
    const outcomeMetrics = configuration.outcomeMetrics as { correctedItem?: unknown } | undefined;
    return outcomeMetrics?.correctedItem === true;
  });
  const approvedReviewResponses = resolvedAmbiguityStudies.reduce(
    (total, study) => total + study.approvedResponses,
    0,
  );
  const humanReviewCostCents = Math.abs(sum("HUMAN_REVIEW_COST"));

  return {
    orders,
    business: {
      serviceRevenueCents: sum("SERVICE_REVENUE"),
      paymentFeeCents: Math.abs(sum("PAYMENT_FEE")),
      marketCostCents,
      sponsoredCreditCents,
      grossMarginCents: sum("SERVICE_REVENUE") - Math.abs(sum("PAYMENT_FEE")) - marketCostCents,
    },
    reviewEfficiency: {
      correctedItems: correctedItems.length,
      resolvedAmbiguities: resolvedAmbiguityStudies.length,
      humanCostPerCorrectedItemCents:
        correctedItems.length > 0 ? Math.round(humanReviewCostCents / correctedItems.length) : null,
      responsesPerResolvedAmbiguity:
        resolvedAmbiguityStudies.length > 0
          ? approvedReviewResponses / resolvedAmbiguityStudies.length
          : null,
    },
    needsAttention: [
      ...failedWorkflows.map((run) => ({
        kind: "Workflow" as const,
        id: run.id,
        reason: run.lastError ?? "Workflow failed",
        attemptCount: run.attemptCount,
        occurredAt: run.createdAt,
      })),
      ...failedMessages.map((message) => ({
        kind: "Message" as const,
        id: message.id,
        reason: message.lastError ?? "Message delivery failed",
        attemptCount: message.attemptCount,
        occurredAt: message.createdAt,
      })),
      ...failedWebhooks.map((event) => ({
        kind: "Webhook" as const,
        id: event.id,
        reason: event.lastError ?? "Webhook processing failed",
        attemptCount: event.attemptCount,
        occurredAt: event.receivedAt,
      })),
    ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()),
    studies: studies.map((study) => ({
      id: study.id,
      type: study.type,
      status: study.status,
      targetParticipants: study.targetParticipants,
      approvedResponses: study.approvedResponses,
      quotedCostCents: study.quotedCostCents,
      actualCostCents: study.actualCostCents,
      costPerApprovedResponseCents:
        study.actualCostCents !== null && study.approvedResponses > 0
          ? Math.round(study.actualCostCents / study.approvedResponses)
          : null,
    })),
    metrics: metricSnapshots.map((snapshot) => ({
      studyId: snapshot.studyId,
      variant: snapshot.variant,
      sampleSize: snapshot.sampleSize,
      metrics: snapshot.metrics,
    })),
    productChanges: productChanges.map((change) => ({
      id: change.id,
      code: change.code,
      finding: change.humanFinding.findingText,
      occurrenceCount: change.humanFinding.occurrenceCount,
      appliedPolicyVersion: change.appliedPolicyVersion,
    })),
    impact: {
      localHandoffs: impactEvents.filter((event) => event.type === "LOCAL_HANDOFF").length,
      recordedWeightGrams: impactEvents
        .filter((event) => event.unit === "grams")
        .reduce((total, event) => total + (event.quantity ?? 0), 0),
      events: impactEvents,
    },
  };
}
