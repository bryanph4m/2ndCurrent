import { describe, expect, it } from "vitest";
import { parseRuntimeEnvironment } from "./runtimeEnv";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/secondcurrent",
  PHONE_LOOKUP_KEY: "lookup",
  FIELD_ENCRYPTION_KEY: "encryption",
  SESSION_SECRET: "session",
  ADMIN_SESSION_SECRET: "admin",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$aGFzaA==",
};

describe("parseRuntimeEnvironment", () => {
  it("accepts the complete mock configuration and supplies safe defaults", () => {
    const environment = parseRuntimeEnvironment(base);
    expect(environment.INTEGRATION_MODE).toBe("mock");
    expect(environment.OBJECT_STORAGE_MODE).toBe("memory");
  });

  it("rejects live mode without every provider and private S3 setting", () => {
    expect(() => parseRuntimeEnvironment({ ...base, INTEGRATION_MODE: "live" })).toThrow(
      "LINQ_API_KEY",
    );
  });

  it("requires model credentials when Anthropic vision is selected", () => {
    expect(() => parseRuntimeEnvironment({ ...base, VISION_PROVIDER: "anthropic" })).toThrow(
      "ANTHROPIC_API_KEY",
    );
  });
});
