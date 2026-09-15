import "server-only";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_POLICY_KEYS,
  coercePolicyValue,
  envOverrideFor,
  type ProductPolicyKey,
} from "@/config/product-policy";

/** Read each time for predictable tests (no long-lived cache). */
export async function getProductPolicyFlag(
  key: ProductPolicyKey
): Promise<boolean> {
  const env = envOverrideFor(key);
  if (env !== undefined) return env;

  const row = await prisma.productPolicy.findUnique({ where: { key } });
  if (!row) return false;
  return coercePolicyValue(row.valueJson);
}

export async function isMonetizationEnabled(): Promise<boolean> {
  return getProductPolicyFlag(PRODUCT_POLICY_KEYS.MONETIZATION_ENABLED);
}

export async function isTrialEnabled(): Promise<boolean> {
  return getProductPolicyFlag(PRODUCT_POLICY_KEYS.TRIAL_ENABLED);
}

export async function isNativePushEnabled(): Promise<boolean> {
  return getProductPolicyFlag(PRODUCT_POLICY_KEYS.NATIVE_PUSH_ENABLED);
}

export async function setProductPolicyFlag(
  key: ProductPolicyKey,
  enabled: boolean,
  updatedBy?: string
): Promise<void> {
  await prisma.productPolicy.upsert({
    where: { key },
    create: { key, valueJson: { enabled }, updatedBy: updatedBy ?? null },
    update: { valueJson: { enabled }, updatedBy: updatedBy ?? null },
  });
}
