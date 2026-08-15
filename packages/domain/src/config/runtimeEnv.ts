import { z } from "zod";

const OptionalSecret = z.string().min(1).optional();
const OptionalUrl = z.string().url().optional();

export const RuntimeEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: OptionalUrl,
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    INTEGRATION_MODE: z.enum(["mock", "live"]).default("mock"),
    VISION_PROVIDER: z.enum(["fixture", "openai"]).default("fixture"),
    OBJECT_STORAGE_MODE: z.enum(["memory", "s3"]).default("memory"),
    PHONE_LOOKUP_KEY: OptionalSecret,
    FIELD_ENCRYPTION_KEY: OptionalSecret,
    SESSION_SECRET: OptionalSecret,
    ADMIN_SESSION_SECRET: OptionalSecret,
    ADMIN_PASSWORD_HASH: OptionalSecret,
    LINQ_API_KEY: OptionalSecret,
    LINQ_WEBHOOK_SECRET: OptionalSecret,
    STRIPE_SECRET_KEY: OptionalSecret,
    STRIPE_WEBHOOK_SECRET: OptionalSecret,
    STRIPE_PAYMENT_LINK_URL: OptionalUrl,
    TERAC_API_KEY: OptionalSecret,
    TERAC_WEBHOOK_SECRET: OptionalSecret,
    TERAC_PROJECT_ID: OptionalSecret,
    TERAC_API_BASE: OptionalUrl,
    RENDER_API_KEY: OptionalSecret,
    RENDER_WORKFLOW_SLUG: OptionalSecret,
    OPENAI_API_KEY: OptionalSecret,
    VISION_MODEL: OptionalSecret,
    S3_ENDPOINT: OptionalUrl,
    S3_REGION: OptionalSecret,
    S3_BUCKET: OptionalSecret,
    S3_ACCESS_KEY_ID: OptionalSecret,
    S3_SECRET_ACCESS_KEY: OptionalSecret,
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  })
  .passthrough()
  .superRefine((environment, context) => {
    const requireKeys = (keys: string[], reason: string) => {
      for (const key of keys) {
        if (!environment[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required ${reason}`,
          });
        }
      }
    };

    requireKeys(
      [
        "DATABASE_URL",
        "PHONE_LOOKUP_KEY",
        "FIELD_ENCRYPTION_KEY",
        "SESSION_SECRET",
        "ADMIN_SESSION_SECRET",
        "ADMIN_PASSWORD_HASH",
      ],
      "for the server runtime",
    );
    if (environment.INTEGRATION_MODE === "live") {
      requireKeys(
        [
          "LINQ_API_KEY",
          "LINQ_WEBHOOK_SECRET",
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "STRIPE_PAYMENT_LINK_URL",
          "TERAC_API_KEY",
          "TERAC_WEBHOOK_SECRET",
          "TERAC_PROJECT_ID",
          "RENDER_API_KEY",
          "RENDER_WORKFLOW_SLUG",
        ],
        "when INTEGRATION_MODE=live",
      );
      if (environment.OBJECT_STORAGE_MODE !== "s3") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OBJECT_STORAGE_MODE"],
          message: "OBJECT_STORAGE_MODE must be s3 when INTEGRATION_MODE=live",
        });
      }
    }
    if (environment.VISION_PROVIDER === "openai") {
      requireKeys(["OPENAI_API_KEY", "VISION_MODEL"], "when VISION_PROVIDER=openai");
    }
    if (environment.OBJECT_STORAGE_MODE === "s3") {
      requireKeys(
        ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
        "when OBJECT_STORAGE_MODE=s3",
      );
    }
  });

export type RuntimeEnvironment = z.infer<typeof RuntimeEnvironmentSchema>;

export function parseRuntimeEnvironment(
  source: Record<string, string | undefined>,
): RuntimeEnvironment {
  return RuntimeEnvironmentSchema.parse(source);
}
