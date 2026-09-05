/**
 * Emergency kill switches — env-based, auditable when flipped via admin API.
 * Failure of a subsystem must not require taking the whole app offline.
 * These are NOT Dealer Readiness gates.
 */
export type KillSwitchKey =
  | "matching_new"
  | "push"
  | "interest_new"
  | "reveal";

const ENV_MAP: Record<KillSwitchKey, string> = {
  matching_new: "KILL_MATCHING_NEW",
  push: "KILL_PUSH",
  interest_new: "KILL_INTEREST_NEW",
  reveal: "KILL_REVEAL",
};

export function isKillSwitchOn(key: KillSwitchKey): boolean {
  const envName = ENV_MAP[key];
  const raw = process.env[envName];
  return raw === "1" || raw === "true" || raw === "TRUE";
}

export function getKillSwitchState(): Record<KillSwitchKey, boolean> {
  return {
    matching_new: isKillSwitchOn("matching_new"),
    push: isKillSwitchOn("push"),
    interest_new: isKillSwitchOn("interest_new"),
    reveal: isKillSwitchOn("reveal"),
  };
}
