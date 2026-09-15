/**
 * Vehicle media readiness gate (Search-First VNext)
 *
 * Choice: keep Vehicle.status lifecycle unchanged. Add `mediaReady` boolean.
 * - Existing inventory: DEFAULT true (grandfathered) — no breakage of ACTIVE stock.
 * - All NEW vehicles (manual/agent/import): mediaReady=false until ≥1 EXTERIOR + ≥1 INTERIOR IMAGE.
 * - Matching findMany filters mediaReady=true; rematch runs when a vehicle becomes ready.
 *
 * Media binaries live on VPS filesystem (MEDIA_ROOT). DB stores storageKey metadata only.
 */
export {};
