import { parseRuntimeEnvironment, type RuntimeEnvironment } from "@secondcurrent/domain";

let environment: RuntimeEnvironment | undefined;

export function getServerEnvironment(): RuntimeEnvironment {
  environment ??= parseRuntimeEnvironment(process.env);
  return environment;
}

export function requireServerEnvironmentValue(key: keyof RuntimeEnvironment): string {
  const value = getServerEnvironment()[key];
  if (typeof value !== "string" || !value) throw new Error(`${String(key)} is required`);
  return value;
}
