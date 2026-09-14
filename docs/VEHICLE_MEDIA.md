/**
 * Vehicle media readiness gate (Search-First VNext)
 *
 * Choice: keep Vehicle.status lifecycle unchanged. Add `mediaReady` boolean.
 * - Existing inventory: DEFAULT true (grandfathered) — no breakage of ACTIVE stock.
 * - New manual/agent vehicles: mediaReady=false until ≥1 EXTERIOR + ≥1 INTERIOR IMAGE.
 * - Import source: starts mediaReady=true (bulk import may lack photos initially;
 *   dealers can still add media; network already expects imported stock to participate).
 * - Matching findMany filters mediaReady=true; rematch runs when a vehicle becomes ready.
 *
 * Media binaries live on VPS filesystem (MEDIA_ROOT). DB stores storageKey metadata only.
 */
export {};
