# Production Hardening Audit — REMATCHER Exchange

**Date:** 2026-09-01  
**Production commit:** `36b1380` (pending next deploy with hardening changes)  
**Canonical URL:** https://exchange.rematcher.co.il

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | 1 fixed, 1 partial |
| High | 8 | 4 fixed, 4 partial |
| Medium | 12 | mixed |

---

## Critical

### C1 — Migration role cannot ALTER existing tables
- **Was:** `rematcher_prisma` not owner → `must be owner of table User` (P3009)
- **Now:** Application tables transferred to `rematcher_prisma`; proof migration `20260901190000` deployed via `prisma migrate deploy`
- **Remaining:** Set `MIGRATION_DATABASE_URL` (postgres role) on Vercel for defense-in-depth separation
- **Verify:** `npx tsx scripts/migration-role-proof.ts`

### C2 — Production deploy stuck on old SHA
- **Was:** Failed migration blocked all deploys
- **Now:** Fixed; `/api/health` shows current commit
- **Verify:** `npx tsx scripts/public-entry-smoke.ts` after each deploy

---

## High

### H1 — Runtime vs migration connection separation
- **Status:** Partial
- **Done:** `MIGRATION_DATABASE_URL` support in `migrate-if-production.js`, docs updated
- **Gap:** Vercel env not yet set; currently relies on `rematcher_prisma` ownership transfer
- **Fix:** Add `MIGRATION_DATABASE_URL` (postgres, session mode) in Vercel Production only

### H2 — Auth API authorization (not just UI)
- **Status:** Verified in Signup E2E
- **Protected:** `requireVerifiedDealer()` on demands, assistant, inventory import
- **Pending dealer:** 403 on `/api/demands`, `/api/assistant/chat`; redirect to `/pending-approval`
- **Gap:** Audit remaining routes for `requireVerifiedDealer` coverage

### H3 — Rate limiting (shared state)
- **Status:** Fixed
- **Implementation:** `RateLimitEntry` in Postgres, atomic upsert
- **Tests:** `tests/rate-limit.test.ts`

### H4 — Signup flow E2E
- **Status:** Verified (`scripts/signup-e2e-production.ts` — 22/22 automated PASS)
- **Manual:** Resend delivery confirmation in dashboard (4 emails)

### H5 — Commercial invariants (5 free connections)
- **Status:** Verified at signup, verification, approval, login — always 1 `DealerCommercial`, allowance=5

### H6 — Secrets separation
- **Status:** Partial
- **Done:** `.env.example` documents vars; no secrets in repo
- **Gap:** Preview shares production DB — migrations disabled on preview (OK)

### H7 — PWA stale cache
- **Status:** Partial
- **Done:** SW cache bumped to v3
- **Gap:** Post-deploy verification of old bundle removal not automated

### H8 — Observability (deployed SHA)
- **Status:** Fixed
- **Endpoint:** `/api/health` returns commit, environment, agentVersion

---

## Medium

### M1 — Public entry smoke false negatives
- **Status:** Fixed — login checks `התחבר` / email input (10/10 PASS)

### M2 — Manual `_prisma_migrations` repair
- **Status:** Documented as recovery-only in `DEPLOYMENT_ARCHITECTURE.md`
- **Normal path:** `prisma migrate deploy`

### M3 — Agent latency / tool fan-out
- **Status:** Not in scope this batch (Agent 2.2 demand-driven — next phase)

### M4 — OpenAI failure / cost tracking
- **Status:** Partial — `AiOperationLog` exists; no alerting

### M5 — Push canonical origin
- **Status:** Open — not tested this batch

### M6 — Grace Reveal E2E
- **Status:** Open — next phase

### M7 — Mobile performance baseline
- **Status:** Open — next phase

### M8 — DB backup / restore test
- **Status:** Relies on Supabase PITR; no restore drill documented

### M9 — Concurrency / idempotency (Interest, Reveal)
- **Status:** Partial — `RevealUsage` idempotency in commercial service; no load test

### M10 — Resend failure handling
- **Status:** Partial — signup succeeds even if email fails silently? Audit email error paths

### M11 — Signup abuse / enumeration
- **Status:** Partial — rate limits on signup/forgot-password; generic forgot-password response

### M12 — Dependency / security updates
- **Status:** Ongoing — Next 15.5, Prisma 6.19; no automated CVE scan

---

## Verification Commands

```bash
# Migration role proof
npx tsx scripts/migration-role-proof.ts

# Public entry (canonical)
npx tsx scripts/public-entry-smoke.ts

# Full signup + forgot password E2E
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npx tsx scripts/signup-e2e-production.ts

# Migration status
npx prisma migrate status
```

---

## Recommended Next Actions (priority order)

1. Add `MIGRATION_DATABASE_URL` to Vercel Production (postgres role)
2. Deploy hardening commit; verify `/api/health` SHA
3. Confirm Resend deliveries manually for last QA signup run
4. Agent 2.2 production golden scenarios
5. Grace Reveal E2E
6. Push on canonical domain
7. Mobile performance baseline
