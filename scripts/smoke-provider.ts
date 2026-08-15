import { randomUUID } from "node:crypto";
import {
  OpenAIVisionProvider,
  LinqMessagingProvider,
  RenderTaskRunner,
  S3ObjectStorage,
  StripePaymentProvider,
  TeracHumanReviewProvider,
} from "../packages/integrations/src/index";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this live smoke test`);
  return value;
}

function storage(): S3ObjectStorage {
  return new S3ObjectStorage({
    endpoint: required("S3_ENDPOINT"),
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
}

const provider = process.argv[2];
if (provider === "linq") {
  const result = await new LinqMessagingProvider({
    apiKey: required("LINQ_API_KEY"),
    webhookSecret: required("LINQ_WEBHOOK_SECRET"),
  }).sendText({
    chatId: required("SMOKE_LINQ_CHAT_ID"),
    text: "SecondCurrent controlled live smoke test",
    idempotencyKey: `smoke:${randomUUID()}`,
  });
  console.log(`Linq message: ${result.providerMessageId}`);
} else if (provider === "stripe") {
  const result = await new StripePaymentProvider({
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    paymentLinkUrl: required("STRIPE_PAYMENT_LINK_URL"),
  }).createCheckout({
    orderId: `smoke-${randomUUID()}`,
    amountCents: 5_000,
    currency: "USD",
    returnUrl: `${required("APP_BASE_URL")}/checkout/return`,
  });
  console.log(`Stripe test checkout: ${result.checkoutUrl}`);
} else if (provider === "terac") {
  const reviews = new TeracHumanReviewProvider({
    apiKey: required("TERAC_API_KEY"),
    webhookSecret: required("TERAC_WEBHOOK_SECRET"),
    projectId: required("TERAC_PROJECT_ID"),
    apiBase: process.env.TERAC_API_BASE ?? "https://terac.com/api/external/v2",
  });
  const draft = await reviews.createDraft({
    title: "SecondCurrent controlled smoke test",
    internalTitle: `smoke-${randomUUID()}`,
    numParticipants: 1,
    taskUrl: `${required("APP_BASE_URL")}/study/smoke`,
  });
  if (process.env.SMOKE_TERAC_LAUNCH === "true") await reviews.launch(draft.externalOpportunityId);
  console.log(`Terac draft: ${draft.externalOpportunityId}`);
} else if (provider === "render") {
  const result = await new RenderTaskRunner({
    apiKey: required("RENDER_API_KEY"),
    workflowSlug: required("RENDER_WORKFLOW_SLUG"),
  }).start(
    "match-demand",
    { demandId: required("SMOKE_RENDER_DEMAND_ID") },
    `smoke:${randomUUID()}`,
  );
  console.log(`Render task: ${result.runId}`);
} else if (provider === "storage") {
  const objects = storage();
  const key = `smoke/${randomUUID()}.txt`;
  await objects.putPrivateObject({
    objectKey: key,
    bytes: Buffer.from("private"),
    mimeType: "text/plain",
  });
  const signedUrl = await objects.createSignedReadUrl(key, 60);
  const response = await fetch(signedUrl);
  if ((await response.text()) !== "private") throw new Error("Signed S3 read did not match upload");
  await objects.deleteObject(key);
  console.log("Private S3 upload, signed read, and delete passed");
} else if (provider === "vision") {
  const result = await new OpenAIVisionProvider({
    apiKey: required("OPENAI_API_KEY"),
    model: required("VISION_MODEL"),
    storage: storage(),
  }).analyzeImage({
    objectKey: required("SMOKE_VISION_OBJECT_KEY"),
    sha256: required("SMOKE_VISION_SHA256"),
    imageRole: "full_item",
  });
  console.log(`Vision observation: ${result.imageRole} (${result.identity.confidence})`);
} else {
  throw new Error("Usage: pnpm smoke:live <linq|stripe|terac|render|storage|vision>");
}
