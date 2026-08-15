import {
  OpenAIVisionProvider,
  FixtureVisionProvider,
  LinqMessagingProvider,
  MemoryObjectStorage,
  MockHumanReviewProvider,
  MockMessagingProvider,
  MockPaymentProvider,
  S3ObjectStorage,
  StripePaymentProvider,
  TeracHumanReviewProvider,
  type HumanReviewProvider,
  type MessagingProvider,
  type ObjectStorage,
  type PaymentProvider,
  type VisionProvider,
} from "@secondcurrent/integrations";
import { getServerEnvironment, requireServerEnvironmentValue } from "./env.js";

// Mirrors apps/web/lib's provider getters. The workflow service is a
// separate deployable (section 8.1) with its own process and env vars, so it
// builds its own provider instances rather than importing anything from
// apps/web - the same env var names configure both services (section 36).
let messagingProvider: MessagingProvider | undefined;
let paymentProvider: PaymentProvider | undefined;
let visionProvider: VisionProvider | undefined;
let objectStorage: ObjectStorage | undefined;
let humanReviewProvider: HumanReviewProvider | undefined;

export function getObjectStorage(): ObjectStorage {
  if (!objectStorage) {
    const environment = getServerEnvironment();
    objectStorage =
      environment.OBJECT_STORAGE_MODE === "s3"
        ? new S3ObjectStorage({
            endpoint: requireServerEnvironmentValue("S3_ENDPOINT"),
            region: requireServerEnvironmentValue("S3_REGION"),
            bucket: requireServerEnvironmentValue("S3_BUCKET"),
            accessKeyId: requireServerEnvironmentValue("S3_ACCESS_KEY_ID"),
            secretAccessKey: requireServerEnvironmentValue("S3_SECRET_ACCESS_KEY"),
            forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
          })
        : new MemoryObjectStorage();
  }
  return objectStorage;
}

export function getMessagingProvider(): MessagingProvider {
  if (messagingProvider) {
    return messagingProvider;
  }
  if (process.env.INTEGRATION_MODE === "live") {
    const apiKey = process.env.LINQ_API_KEY;
    const webhookSecret = process.env.LINQ_WEBHOOK_SECRET;
    if (!apiKey || !webhookSecret) {
      throw new Error(
        "LINQ_API_KEY and LINQ_WEBHOOK_SECRET are required when INTEGRATION_MODE=live",
      );
    }
    messagingProvider = new LinqMessagingProvider({ apiKey, webhookSecret });
  } else {
    messagingProvider = new MockMessagingProvider();
  }
  return messagingProvider;
}

export function getPaymentProvider(): PaymentProvider {
  if (paymentProvider) {
    return paymentProvider;
  }
  if (process.env.INTEGRATION_MODE === "live") {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const paymentLinkUrl = process.env.STRIPE_PAYMENT_LINK_URL;
    if (!secretKey || !webhookSecret || !paymentLinkUrl) {
      throw new Error(
        "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PAYMENT_LINK_URL are required when INTEGRATION_MODE=live",
      );
    }
    paymentProvider = new StripePaymentProvider({ secretKey, webhookSecret, paymentLinkUrl });
  } else {
    paymentProvider = new MockPaymentProvider();
  }
  return paymentProvider;
}

export function getVisionProvider(): VisionProvider {
  if (visionProvider) {
    return visionProvider;
  }
  if (process.env.VISION_PROVIDER === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.VISION_MODEL;
    if (!apiKey || !model) {
      throw new Error("OPENAI_API_KEY and VISION_MODEL are required when VISION_PROVIDER=openai");
    }
    visionProvider = new OpenAIVisionProvider({ apiKey, model, storage: getObjectStorage() });
  } else {
    visionProvider = new FixtureVisionProvider({});
  }
  return visionProvider;
}

export function getHumanReviewProvider(): HumanReviewProvider {
  if (humanReviewProvider) {
    return humanReviewProvider;
  }
  if (process.env.INTEGRATION_MODE === "live") {
    const apiKey = process.env.TERAC_API_KEY;
    const webhookSecret = process.env.TERAC_WEBHOOK_SECRET;
    const projectId = process.env.TERAC_PROJECT_ID;
    const apiBase = process.env.TERAC_API_BASE ?? "https://terac.com/api/external/v2";
    if (!apiKey || !webhookSecret || !projectId) {
      throw new Error(
        "TERAC_API_KEY, TERAC_WEBHOOK_SECRET, and TERAC_PROJECT_ID are required when INTEGRATION_MODE=live",
      );
    }
    humanReviewProvider = new TeracHumanReviewProvider({
      apiKey,
      apiBase,
      projectId,
      webhookSecret,
    });
  } else {
    humanReviewProvider = new MockHumanReviewProvider();
  }
  return humanReviewProvider;
}

export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
