# Conversation Workspace — Baseline Checkpoint

**Created:** 2026-09-18  
**Purpose:** Rollback/comparison baseline before ConversationThread architecture.  
**Production NOT rolled back.**

## Repository HEADs (exact)

| Repo | Expected | Actual |
|------|----------|--------|
| Backend `rebuild/search-first-vnext` | `3393b7c128b81db29f2956c3cd349cbde08019b9` | `3393b7c128b81db29f2956c3cd349cbde08019b9` |
| Mobile `master` | `a000be9bd477c0e8c592f24c04f4b4aab43549b5` | `a000be9bd477c0e8c592f24c04f4b4aab43549b5` |
| Production health | same Backend SHA | `3393b7c128b81db29f2956c3cd349cbde08019b9` ok |

## Regression at checkpoint

| Suite | Result |
|-------|--------|
| Backend `npm test` | **951 passed / 5 skipped** (96 files) |
| Mobile Linux preflight | **PASS** (38 static tests + validators) |
| DEVICE_ACCEPTANCE.md | Present — DA-01…DA-26 |

## Hardening invariants (carry-forward)

These MUST survive Conversation/Thread migration:

1. **Synthetic market isolation** — REAL ordinary dealers never consume/contribute synthetic commercial workflows; SYNTHETIC never matches REAL.
2. **Candidate identity ≠ intent ≠ commit** — plate/GOV verify must not create Vehicle; only explicit intent commits.
3. **Action Truth** — LLM proposes; Action Gateway authorizes; pending ≠ success; executor success authorizes success copy.
4. **Output hygiene** — no `null null`, raw routes/enums/codes, privacy notes in dealer UI.
5. **כולם למלאי** — per-candidate independence, idempotency, structured partial results, no generic connectivity copy for app errors.
6. **Zero Re-entry** — known plate never re-asked; thread history is not system truth.
7. **Intelligence** — Swift never computes market truth; all engine actions remain canonical backend.

## Capability state at baseline (pre-conversation)

From prior addendum work on this SHA line:

| Area | Baseline state |
|------|----------------|
| Share account binding / idempotency | Implemented |
| Intake plateIdentityState / GOV states | Implemented |
| EXTERNAL without forced commit | Implemented (3393b7c) |
| MATCH_MY_CUSTOMERS make/model subject | Implemented |
| formatVehicleDisplayLabel | Implemented (backend + mobile) |
| Synthetic seed 6 dealers / 48 / 24 | Seeded in Production |
| Beta canAccessSyntheticMarket (gal, apple-review) | Enabled |
| Agent Action Truth / pendingConfirmation | Partially hardened — audit for structural gaps |
| Bilateral SYNTHETIC↔REAL isolation | **Must re-verify** (requester-only filter risk) |
| resolveIntakeCandidate without commit | **Must re-verify** |
| כולם למלאי mixed-state + Mobile mapping | **Must re-verify / complete** |

## Approved visual SoT preserved

- `docs/design/reference/approved-home.png` (Mobile repo)
- `docs/design/reference/approved-agent-chat.png` (Mobile repo)

## Next

1. Remediation gap audit vs independent SHA findings (not blind reimplementation).
2. Additive ConversationThread / Message / Action migration on top of this baseline.
3. No Codemagic / TestFlight from this work order.
