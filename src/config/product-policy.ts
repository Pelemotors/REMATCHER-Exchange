/**
 * Product feature flags for monetization / trial / native push.
 * Env overrides win; ProductPolicy table is source of truth when env unset.
 * Defaults: all OFF.
 */

export const PRODUCT_POLICY_KEYS = {
  MONETIZATION_ENABLED: "MONETIZATION_ENABLED",
  TRIAL_ENABLED: "TRIAL_ENABLED",
  NATIVE_PUSH_ENABLED: "NATIVE_PUSH_ENABLED",
} as const;

export type ProductPolicyKey =
  (typeof PRODUCT_POLICY_KEYS)[keyof typeof PRODUCT_POLICY_KEYS];

const ENV_MAP: Record<ProductPolicyKey, string> = {
  MONETIZATION_ENABLED: "MONETIZATION_ENABLED",
  TRIAL_ENABLED: "TRIAL_ENABLED",
  NATIVE_PUSH_ENABLED: "NATIVE_PUSH_ENABLED",
};

/** Parse env string to boolean; undefined if unset/empty. */
export function parseEnvBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return undefined;
}

export function envOverrideFor(key: ProductPolicyKey): boolean | undefined {
  return parseEnvBool(process.env[ENV_MAP[key]]);
}

export function coercePolicyValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const parsed = parseEnvBool(value);
    return parsed ?? false;
  }
  if (value && typeof value === "object" && "enabled" in value) {
    return Boolean((value as { enabled: unknown }).enabled);
  }
  return false;
}

export const TRIAL_DURATION_DAYS = 21;
