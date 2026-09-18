# Conversation Workspace — Remediation Gap Audit

**Audit date:** 2026-09-18  
**Scope:** Audit only (no implementation).

| Repository | Branch context | HEAD |
|------------|----------------|------|
| Backend `/srv/gal/rematcher-exchange/app` | `rebuild/search-first-vnext` | `3393b7c128b81db29f2956c3cd349cbde08019b9` |
| Mobile `/srv/gal/REMATCHER-Exchange-Mobile` | `master` | `a000be9bd477c0e8c592f24c04f4b4aab43549b5` |

Baseline reference: `docs/forensics/conversation-workspace-baseline.md`.

---

## 1. SYNTHETIC BILATERAL ISOLATION

**STATUS:** **PARTIAL**

### Evidence

| Area | Path | Lines (approx.) | Finding |
|------|------|-----------------|--------|
| Canonical scope helpers (viewer-centric, not pairwise) | `src/services/dealer/market-scope.ts` | 4–26 | `dealerAllowsSyntheticMarket`, `networkDemandWhere(excludeDealerId, allowSyntheticMarket)` — excludes `dealer.marketMode === SYNTHETIC` when `allowSyntheticMarket === false`. |
| Supply-side mirror | `src/services/vehicles/relationship-visibility.ts` | 29–42 | `networkSupplyWhere(excludeDealerId, allowSyntheticMarket)` — same SYNTHETIC exclusion pattern. |
| Matching consumption | `src/services/domain/matching-flow.ts` | 58–60 | `allowSynthetic = await dealerAllowsSyntheticMarket(demand.dealerId)` then `networkSupplyWhere(demand.dealerId, allowSynthetic)`. |
| Intelligence engine | `src/services/exchange-intelligence/engine.ts` | 575–597 | Uses `networkSupplyWhere` + `networkDemandWhere` with same `dealerAllowsSyntheticMarket(dealerId)` flag. |
| Network intelligence | `src/services/network-intelligence/index.ts` | 95–104 | Same paired where-clauses. |
| Watches → intel | `src/services/market-watch/evaluate.ts` | 91–99 | Delegates to `runExchangeIntelligenceEngine` (inherits viewer-centric filter). |
| Opportunities / notifications | `src/services/domain/matching-flow.ts` | 243–249, 399–410 | `maybeOpportunityFromNetworkMatch` / `notifyDealerUsers` run on match results with **no** extra `marketMode` gate beyond supply filter above. |
| Rematch on REAL inventory change | `src/services/matching/inventory-rematch.ts` | 41–57 | `demand.findMany({ status: "ACTIVE", dealerId: { not: sellerDealerId } })` — **no** `marketMode` filter; then `runMatchingForDemand` per demand. |
| Seed / beta intent | `scripts/seed-synthetic-beta-market.ts` | 143–149 | Optional `canAccessSyntheticMarket` on REAL dealers (beta visibility). |

### Answers to explicit checks

- **ONE canonical bilateral market compatibility (both sides)?** **No.** Two parallel helpers (`networkDemandWhere`, `networkSupplyWhere`) keyed off **viewer's** `canAccessSyntheticMarket`, not a single `marketsCompatible(buyerDealer, sellerDealer)` (or equivalent) used everywhere.
- **REAL requester excludes SYNTHETIC supply?** **Yes** when `canAccessSyntheticMarket` is false (default): `matching-flow.ts:58–60` + `relationship-visibility.ts:39–41`.
- **SYNTHETIC requester only sees SYNTHETIC?** **No.** A SYNTHETIC dealer with default `canAccessSyntheticMarket === false` still queries **REAL** network supply (`networkSupplyWhere` only adds SYNTHETIC exclusion on the *other* side, not “viewer must be same cohort”).
- **Can SYNTHETIC demand match REAL supply?** **Yes.** `rematchInventoryBatch` includes all ACTIVE foreign demands (including SYNTHETIC); `runMatchingForDemand` for a SYNTHETIC-owned demand loads REAL vehicles.
- **Does `rematchInventoryBatch` iterate ALL ACTIVE demands (incl. synthetic) when REAL inventory mutates?** **Yes.** `inventory-rematch.ts:41–47`.

### GAPS to implement

- Bilateral isolation: block cross-`marketMode` matching in **both** directions (SYNTHETIC↔REAL), not only “hide SYNTHETIC from REAL.”
- Single canonical compatibility primitive reused by matching, intelligence, watches, opportunity surfacing, and rematch batching (or explicit documented pairing with symmetric predicates).
- Automated tests for SYNTHETIC↔REAL non-match (none in `tests/` at this SHA; only mocks in `product-hardening-backend.test.ts:26–32`).

### Suggested fix approach

- Introduce `marketPairAllowed(viewerDealerId, counterpartyDealerId)` (or derive from both dealers' `marketMode` + beta flag) and apply in `runMatchingForDemand` vehicle query **and** any reverse/counterparty demand eligibility.
- Optionally filter `rematchInventoryBatch` demand set with the same rule (still run synthetic-internal rematch when synthetic inventory changes).
- Add integration tests: REAL demand + SYNTHETIC supply → no `CandidateMatch`; SYNTHETIC demand + REAL supply → no match; beta flag enables controlled overlap only.

---

## 2. CANDIDATE VERIFY WITHOUT COMMIT

**STATUS:** **MISSING** (relative to baseline invariant #2)

### Evidence

| Step | Path | Lines | Finding |
|------|------|-------|--------|
| Plate resolve + commit | `src/services/intake/review.ts` | 126–142, 191–193 | After plate/GOV update, **`commitOneCandidate`** always invoked (except reject / `createNewDespiteExisting` branch). |
| Intent path also commits | `src/services/intake/apply-intent.ts` | 99–101 | `applyCandidateIntent` calls `commitOneCandidate` for non-EXTERNAL intents. |
| API surface | `src/app/api/v1/intake/review/route.ts` | 53–61 | POST wraps `resolveIntakeCandidate` directly. |
| Mobile plate confirm | `ios/REMATCHERExchange/Screens/CaptureFlowView.swift` | 830–837 | `confirmDetectedPlate` → `repository.resolveIntakeCandidate(...)`. |
| Mobile repository | `ios/REMATCHERExchange/Repositories/ExchangeRepository.swift` | 425–429 | POST `/api/v1/intake/review`. |
| Field name mismatch (Capture) | `CaptureFlowView.swift` | 836, 910 | Sends **`"plate"`**; backend expects **`detectedPlate`** (`review/route.ts:39`, `v1/intake/review/route.ts:39`). `IntakeReviewView.swift:101` uses `detectedPlate` correctly. |
| Agent gateway confirm | `src/services/assistant/action-gateway.ts` | 288–310 | Pending `intake_resolve` confirm calls `resolveIntakeCandidate` → commit path. |

### GAPS to implement

- Split **verify identity** (plate, GOV, media categories) from **commit** (create/merge `Vehicle` on explicit intent).
- Mobile Capture flow should call verify-only endpoint (or review POST that does not commit); align JSON field to `detectedPlate`.
- Ensure low-confidence plate “כן” does not create inventory before OWNED/OFFER/etc.

### Suggested fix approach

- Add `verifyIntakeCandidate` (or extend `resolveIntakeCandidate` with `mode: "verify" | "commit"`) that stops before `commitOneCandidate`.
- Route Mobile `confirmDetectedPlate` and clarification “שלח” through verify mode; keep `applyIntakeIntent` / intent chips as sole commit triggers.
- Accept `plate` as alias for `detectedPlate` in v1 for backward compatibility until Mobile is fixed.

---

## 3. ACTION TRUTH (structural, not regex-only)

**STATUS:** **PARTIAL**

### Evidence

| Mechanism | Path | Lines | Finding |
|-----------|------|-------|--------|
| Pending authority | `src/services/assistant/action-gateway.ts` | 552–580, 288–335 | INTAKE mutations require `pendingConfirmation` before execute; confirm path clears pending. |
| Fast confirm path | `src/services/assistant/v2-orchestrator.ts` | 152–208 | Pending + כן/לא → `runActionGateway`, `finalResponseSource: "action_gateway"`. |
| Gateway vs loop attribution | `v2-orchestrator.ts` | 108, 284, 331, 343 | Sets `meta.finalResponseSource` to `agent_loop` / `action_gateway` / `fallback` / `privacy`. |
| **Regex** copy hygiene | `src/services/assistant/action-truth.ts` | 6–17, 33–48 | `CONFIRMATION_CLAIM_RE`, `MUTATION_SUCCESS_CLAIM_RE`; `sanitizeUserFacingAssistantMessage` strips false claims — **not** tied to executor payloads. |
| Orchestrator sanitization | `v2-orchestrator.ts` | 302–305, 345–355 | Applies regex sanitizer post-gateway / post-loop. |
| Intake success wording | `action-gateway.ts` | 313–318 | Success string “הקליטה הושלמה והרכב נשמר במלאי” when `result.ok` — **after** `resolveIntakeCandidate` which commits (see §2). |
| Agent loop | `src/services/assistant/agent-loop.ts` | 338–356 | Returns text/proposal; **does not** set `finalResponseSource` (orchestrator owns meta). |
| Tests | `tests/intake-plate-gov-action.test.ts` | 82–161 | Pending intake reject/confirm; confirm without pending blocked. |
| Tests | `tests/agent-4-0-hybrid-runtime.test.ts` | 212, 295, 368, 387, 401 | `finalResponseSource` expectations. |

### GAPS to implement

- Structural success: message templates keyed off **`inventoryMutationResult` / executor outcome**, not `result.ok` from a combined verify+commit API.
- Reduce reliance on regex-only `action-truth.ts` for production copy; keep as last-line defense only.
- Intake confirm copy should distinguish “plate verified” vs “saved to inventory.”

### Suggested fix approach

- Centralize `assistantMutationMessage(outcome: ExecutorOutcome)` used by gateway after known mutation types.
- Gate success Hebrew on `{ executed: true, mutationType, entityId? }` from gateway, not LLM text.
- Extend tests: verify path returns read/update copy without “נשמר במלאי” unless commit executor ran.

---

## 4. OUTPUT HYGIENE

**STATUS:** **PARTIAL**

### Evidence

| Item | Path | Lines | Finding |
|------|------|-------|--------|
| Canonical label (backend) | `src/lib/vehicle-display-label.ts` | 13–35 | `formatVehicleDisplayLabel` implemented. |
| Backend usage | `src/services/domain/matching-flow.ts` | 77–84 | Freshness notifications only. |
| Backend usage | `src/services/inventory/mark-sold.ts` | 93–96 | Sold notifications. |
| **Not used** in assistant reads | `src/services/assistant/tools/read-tools.ts` | 46, 209, 240, 306, 319 | Raw `` `${make ?? ""} ${model ?? ""}` `` concatenation. |
| Tests | `tests/product-hardening-backend.test.ts` | 116–146 | Label hygiene unit tests. |
| Mobile hygiene | `ios/REMATCHERExchange/Theme/BrandComponents.swift` | 326–359 | `sanitizedVehicleField`, `vehicleHeadline`, `vehicleDisplayLabel`. |
| Mobile UI | Multiple screens (e.g. `CaptureFlowView.swift:712`) | — | Uses **`vehicleHeadline`**, not `vehicleDisplayLabel` (no plate fallback in headline path). |
| Action Gateway raw routes | `src/services/assistant/action-gateway.ts` | 349, 516, 545–546, 603–604 | User-facing strings include `/intake/review`, `/intake/handoff`, `/validations`. |

### GAPS to implement

- Roll `formatVehicleDisplayLabel` through read-tools, information-request titles, admin search, ingest messages, and other dealer-facing strings.
- Replace gateway route literals with labeled suggestions (href kept internal).
- Mobile: prefer `vehicleDisplayLabel` where plate-only identity exists; align fallback copy with backend.

### Suggested fix approach

- Add thin `displayVehicle(v)` helper wrapping formatter; refactor read-tools first (highest traffic).
- Lint or test forbidding `` `null` `` / empty double-space titles in assistant tool formatters.
- Gateway copy pass: Hebrew labels only in `message`, paths only in `suggestions[].href`.

---

## 5. כולם למלאי — bulk intake

**STATUS:** **PARTIAL**

### Evidence

| Item | Path | Lines | Finding |
|------|------|-------|--------|
| Bulk parse | `src/services/intake/apply-intent.ts` | 209–213 | `parsed.all` → loop `applyOne` for all pending. |
| `dealerIntent` before commit | `apply-intent.ts` | 59–62, 99–101 | Updates `dealerIntent` then `commitOneCandidate`. |
| Per-item results | `apply-intent.ts` | 140–160, 154–159 | `results[]` with per-candidate `ok` / `error`. |
| **Top-level ok hides failures** | `apply-intent.ts` | 206–213 | Returns `{ ok: true, results }` even if some `results[].ok === false`. |
| v1 API | `src/app/api/v1/intake/intent/route.ts` | 41–57 | HTTP 200 + `v1Json(ctx, result)` when `result.ok`; only special-cases first `identity_incomplete`. |
| Legacy web API | `src/app/api/intake/intent/route.ts` | 37–41 | Same `{ ok: true, results }` pattern. |
| Throw risk | `apply-intent.ts` | 148–160 | `applyOne` catches via commit return values; no outer try/catch — **low** throw risk unless downstream throws. |
| `identity_incomplete` | `src/services/inventory/create-vehicle.ts` | 198, 224 | Returned from create path inside commit. |
| Mobile bulk | `CaptureFlowView.swift` | 1162–1170 | On HTTP success, checks `result.ok == false` only; **does not** inspect `results` partial failures; generic “לא הצלחתי לשמור את הבחירה”. |
| Tests | `tests/intake-intent.test.ts` | 20–22 | Parser only for “כולם למלאי”. |
| UI trigger | `src/components/intake/intake-handoff-client.tsx` | 706–708 | Web “כולם למלאי” button. |

### GAPS to implement

- Aggregate HTTP semantics: `ok: false` or `207`/error code when any item fails; or `ok: true` with mandatory client scan of `results` documented in OpenAPI.
- Mobile: map `results[].error` (`identity_incomplete`, `needs_confirmation`, etc.) to specific Hebrew.
- Optional: defer commit until all intents in bulk validated (product decision).

### Suggested fix approach

- After bulk loop, set `ok: results.every(r => r.ok)` and return `partial_failure` code from v1 when mixed.
- Extend `IntakeIntentResult` decoding in Swift to surface per-candidate errors in Capture UI.
- Add vitest: 3 candidates, middle fails GOV/identity — assert API + structured body.

---

## 6. Capability partials — automated tests

**STATUS:** **PARTIAL**

### Evidence

| Capability area | Automated coverage | Path |
|-----------------|-------------------|------|
| SEARCHES | Router + bulk cancel | `tests/universal-agent-3-1-router.test.ts`, `tests/bulk-search-cancel-routing.test.ts` |
| MATCHES | Router read | `universal-agent-3-1-router.test.ts` ~220–235 |
| REVEALS / OUTCOMES | Router read | `universal-agent-3-1-router.test.ts` ~237–266 |
| HELP | Router | `universal-agent-3-1-router.test.ts` ~201–217 |
| INVENTORY | Multiple agent tests | `tests/agent-ai-first-inventory.test.ts`, `agent-4-0-hybrid-runtime.test.ts` |
| INTAKE (agent) | Gateway pending | `tests/intake-plate-gov-action.test.ts` |
| **OPPORTUNITIES** | Mock data only in router setup | `universal-agent-3-1-router.test.ts` ~75 — **no** `capability: "OPPORTUNITIES"` routing test |
| **VALIDATIONS** | Gateway stub message only | `action-gateway.ts:508–519` — **no** dedicated router/executor test |
| ACTIVITY / COMMERCIAL | Not found in test grep | — |
| API v1 opportunities | Error code mapping | `tests/api-v1-core-product.test.ts` ~345 (`MATCH_STALE_OPPORTUNITY`) |
| Commercial reveals constant | Unit | `tests/commercial.test.ts` |

### GAPS to implement

- Router tests for `OPPORTUNITIES`, `VALIDATIONS`, `ACTIVITY`, `COMMERCIAL` READ/mutation paths matching capability model in `capability-model.ts`.
- VALIDATIONS confirm should not remain “redirect to screen” only if product expects in-chat confirm.

### Suggested fix approach

- Extend `universal-agent-3-1-router.test.ts` with one happy-path READ per missing capability (mirror REVEALS pattern).
- Add gateway integration test for VALIDATIONS `CONFIRM_VALIDATION` once executor exists.

---

## 7. Screenshot customer flow tests

**STATUS:** **PARTIAL**

### Evidence

| Layer | Path | Finding |
|-------|------|--------|
| Unit / fixture | `tests/product-hardening-backend.test.ts` | 86–113 — WhatsApp-style text → `parseDemandFallback` / `buildIntakeDemandDraft` (CX-5, trade-in, phone confirm). |
| Unit | `tests/dealer-complete-experience.test.ts` | 94+ — “multi screenshot snippets become one conversation”. |
| E2E | `tests/e2e/live-pixel-acceptance.spec.ts` | 312–360 — “D+F screenshot customer demand IMAGE path”; requires QA creds + fixtures; writes `screenshot-demand.json`. |
| E2E (adjacent) | `tests/e2e/live-authenticated-dealer.spec.ts` | 92+ — intake conversation not “screenshot bot”. |
| Backend services | `src/services/intake/screenshot-demand.ts`, `classify-intake-pass.ts` | Production path for image → demand draft. |
| Mobile matrix | `REMATCHER-Exchange-Mobile/docs/product/DEVICE_ACCEPTANCE.md` | **DA-16**, **DA-17** manual screenshot scenarios. |

### GAPS to implement

- CI-stable automated test without live QA creds (fixture upload + mocked vision or recorded batch JSON).
- Mobile-native screenshot/share path not covered by backend vitest alone.

### Suggested fix approach

- Add vitest integration with frozen batch fixture asserting `demandDraft` fields (extend hardening test to full API route).
- Keep Playwright test as optional `LIVE_QA` job; document skip reason in report/README.

---

## 8. `DEVICE_ACCEPTANCE.md` — DA-01..26

**STATUS:** **PRESERVED** (Mobile repo at audited SHA)

### Evidence

| Location | Finding |
|----------|---------|
| `/srv/gal/REMATCHER-Exchange-Mobile/docs/product/DEVICE_ACCEPTANCE.md` | Sections **DA-01** through **DA-26** present (e.g. DA-01 line 10, DA-26 line 503). |
| Backend `/srv/gal/rematcher-exchange/app` | **No** `DEVICE_ACCEPTANCE.md` (by design — matrix lives in Mobile). |
| Baseline doc | `docs/forensics/conversation-workspace-baseline.md:21` records presence at checkpoint. |

### GAPS to implement

- None for document presence; execution of manual matrix is out of scope for this code audit.
- Optional: link from backend forensics to Mobile canonical path to avoid duplicate copies.

### Suggested fix approach

- Single canonical URL in backend `docs/DEPLOYMENT_POLICY.md` or forensics index pointing to Mobile `docs/product/DEVICE_ACCEPTANCE.md`.
- Track manual run results in release checklist (`docs/release/DEVICE_ACCEPTANCE_CHECKLIST.md` on Mobile).

---

## Summary matrix

| # | Requirement | STATUS |
|---|-------------|--------|
| 1 | Synthetic bilateral isolation | **PARTIAL** |
| 2 | Candidate verify without commit | **MISSING** |
| 3 | Action truth structural | **PARTIAL** |
| 4 | Output hygiene | **PARTIAL** |
| 5 | כולם למלאי bulk intake | **PARTIAL** |
| 6 | Capability partials tests | **PARTIAL** |
| 7 | Screenshot customer flow tests | **PARTIAL** |
| 8 | DEVICE_ACCEPTANCE DA-01..26 | **PRESERVED** (Mobile) |

---

## Recommended remediation order

1. **§2 Verify vs commit** — unblocks correct Action Truth and DA-04/05/06 mobile flows.  
2. **§1 Bilateral SYNTHETIC** — prevents commercial cross-contamination (DA-25/26).  
3. **§5 Bulk partial HTTP + Mobile mapping** — “כולם למלאי” reliability (DA-03).  
4. **§4 Output hygiene** — dealer trust (DA-24).  
5. **§3 Structural action truth** — reduce regex dependence.  
6. **§6–7** — tighten automated coverage for capabilities and screenshot/demand path.
