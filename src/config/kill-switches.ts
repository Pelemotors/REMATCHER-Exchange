/**
 * Emergency kill switches — env-based, auditable when flipped via admin API.
 * Failure of a subsystem must not require taking the whole app offline.
 * These are NOT Dealer Readiness gates.
 */
export type KillSwitchKey =
  | "matching_new"
  | "push"
  | "interest_new"
  | "reveal"
  | "dealer_memory";

const ENV_MAP: Record<KillSwitchKey, string> = {
  matching_new: "KILL_MATCHING_NEW",
  push: "KILL_PUSH",
  interest_new: "KILL_INTEREST_NEW",
  reveal: "KILL_REVEAL",
  dealer_memory: "KILL_DEALER_MEMORY",
};

export function isKillSwitchOn(key: KillSwitchKey): boolean {
  const envName = ENV_MAP[key];
  const raw = process.env[envName];
  return raw === "1" || raw === "true" || raw === "TRUE";
}

/**
 * Dealer Memory is optional contextual memory — not domain source of truth.
 * Pilot fail-closed unless ENABLE_DEALER_MEMORY=1 and kill switch is off.
 */
export function isDealerMemoryRuntimeEnabled(): boolean {
  if (isKillSwitchOn("dealer_memory")) return false;
  const enable = process.env.ENABLE_DEALER_MEMORY;
  return enable === "1" || enable === "true" || enable === "TRUE";
}

export function getKillSwitchState(): Record<KillSwitchKey, boolean> {
  return {
    matching_new: isKillSwitchOn("matching_new"),
    push: isKillSwitchOn("push"),
    interest_new: isKillSwitchOn("interest_new"),
    reveal: isKillSwitchOn("reveal"),
    dealer_memory:
      isKillSwitchOn("dealer_memory") || !isDealerMemoryRuntimeEnabled(),
  };
}
