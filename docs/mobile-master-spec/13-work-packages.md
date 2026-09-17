# 13 — Work Packages

All packages are **reviewable, reversible, additive**. None may deploy Production without the Exchange production script, backup, rollback proof, and `npm test`. Isolated tests first; Production is the Milestone 1 iPhone backend after gates — not a destructive sandbox.

Forbidden globally until a package lists it: Product screen redesign, Capacitor work, RN, OpenAI from clients, Production-as-sandbox.

---

## Template (applies to every package)

**Rollback:** revert the PR; v1 unused by Web; feature-flag route mount if needed.  
**Regression:** `npm test` + production build on Exchange packages that touch `src/`.  
**Evidence:** PR description + isolated test output; Production smoke is public/unauthenticated only until real iPhone use.

---

## Backend track (Exchange repo)

### B01 — Mobile API foundation
- **Scope:** versioned router `/api/v1`, requestId, client headers, health subset, OpenAPI stub.
- **Allowed:** `src/app/api/v1/**`, small shared `src/lib/api-v1/**`.
- **Forbidden:** Auth tokens, migrations, changing `/api/*` behavior.
- **Deps:** Gate 0.
- **Goal:** empty authenticated 401 on `/api/v1/me`.
- **AC:** unauthenticated v1 returns envelope; Web `/api/health` unchanged.
- **Tests:** envelope unit; health dual.
- **Security:** no CORS `*`.

### B02 — Mobile Auth schema/service
- **Scope:** Prisma models for refresh sessions; hash; rotation; revoke-all.
- **Allowed:** `prisma/schema.prisma`, migration, `src/services/identity/mobile-session.ts`.
- **Forbidden:** enabling migration on Production without backup + approval; Web NextAuth rewrite.
- **Deps:** B01.
- **AC:** unit tests for hash/rotate/reuse-detection; Production migrate only after backup + rollback SQL review.
- **Security:** hashes only at rest.

### B03 — Auth endpoints
- **Scope:** login/refresh/logout/me/forgot/reset/verify/oauth/reauth/signup wrappers.
- **Allowed:** `src/app/api/v1/auth/**`, `src/app/api/v1/me/**`.
- **Forbidden:** 30-day non-revocable access; cookie session as Mobile auth.
- **Deps:** B02.
- **AC:** isolated login/refresh/logout tests pass; suspended rejected; Production login is real-user only (no seed accounts).
- **Tests:** auth isolation + rate limit.

### B04 — Authorization hardening
- **Scope:** session-only dealerId on interaction; **device revoke ownership**; login `accountStatus`; live membership on v1.
- **Allowed:** listed routes + auth-guards.
- **Forbidden:** new features.
- **Deps:** can start parallel to B03 for `/api/*` fixes; v1 ctx after B03.
- **AC:** IDOR tests fail closed.
- **Security:** P0 device revoke.

### B05 — Error contract
- **Scope:** mapper to stable codes; use on all v1.
- **Allowed:** `src/lib/api-v1/errors.ts` + v1 routes.
- **Forbidden:** breaking Web JSON.
- **Deps:** B01.
- **AC:** table in 03 covered.

### B06 — Inventory + Intake v1
- **Scope:** wrap list-inventory, mutations, intake batch/intent/review.
- **Deps:** B03, B05.
- **AC:** A≠B media+vehicles; cursor hasMore; capture ACK.
- **Forbidden:** auto-OWNED; object storage migration.

### B07 — Demand v1
- **Scope:** list cursor, parse, confirm, lifecycle, duplicate-check.
- **Deps:** B03, B05.
- **AC:** parse→confirm still PENDING then ACTIVE.

### B08 — Matching / Interest v1
- **Scope:** listBuyerMatches pagination, recordBuyerInterest, privacy DTO golden.
- **Deps:** B03, B05.
- **AC:** no seller fields; 402/409 codes.

### B09 — Validation / Opportunity / Reveal v1
- **Scope:** wrap those services; seller DTO review (explanationJson).
- **Deps:** B08.
- **AC:** reveal only after mutual; A≠B.

### B10 — Notifications / Activity v1
- **Scope:** cursor notifications; activity alias or thin feed.
- **Deps:** B03.
- **AC:** no silent drop without hasMore.

### B11 — Agent v1
- **Scope:** GET conversation, POST turns; ignore client blob; timeout codes; rate limit.
- **Deps:** B03, B09 (context entities).
- **AC:** no OpenAI key path; Action Gateway still writes.
- **Forbidden:** streaming rewrite unless needed later.

### B12 — Media Bearer
- **Scope:** dual-auth GET; uploads already session-bound → Bearer.
- **Deps:** B03, B06.
- **AC:** unauthorized 401; B cannot read A's intake.

### B13 — Device registry hardening
- **Scope:** v1 devices register/revoke with ownership; unique token; lastSeen.
- **Deps:** B03, B04.
- **AC:** B cannot revoke A's installation.

### B14 — APNs sender
- **Scope:** send path using DeviceInstallation iOS tokens. Credentials in **server env**, not git.
- **Deps:** B13, B10.
- **AC:** Field Test send to one device; invalid token → revoke.
- **Forbidden:** claiming delivery without credentials.

### B15 — FCM sender
- **Scope:** analogous to B14.
- **Deps:** B13, B10.

### B16 — Notification orchestration
- **Scope:** domain events → registry → APNs/FCM + keep Web Push.
- **Deps:** B14/B15.
- **AC:** buyer match does not notify the seller as buyer.

### B17 — Account deletion job
- **Scope:** reauth, revoke sessions, disable, async policy application **after POLICY DECISION**.
- **Deps:** B03, legal decisions in 16.
- **Forbidden:** guessing legal retention.

### B18 — Environment hardening
- **Scope:** CRON_SECRET required; strip/ignore `x-vercel-cron` on VPS; Milestone 1 Debug client uses Production URL; automated tests stay isolated.
- **Deps:** none (can parallel).
- **AC:** lifecycle unauthorized without secret.

### B19 — Secondary v1 (customers, catalog, intelligence, paywall)
- **Scope:** wrap remaining dealer screens.
- **Deps:** B03, B05.
- **Gate:** before Gate 3 complete (parity).

---

## Mobile foundation (new repo — after Gate 0, **no live API required for M01–M05**)

### M01 — Create REMATCHER-Exchange-Mobile
Empty structure from 01. No Store upload.

### M02 — Copy contracts
tokens, error codes, screens, deep links from this spec.

### M03 — iOS project foundation
SwiftUI app, flavors Dev/FT/Prod URLs, Heebo, RTL, tab shell placeholders.

### M04 — Android project foundation
Same flavors; no Production google-services in Dev.

### M05 — Design tokens implemented
Color/type/spacing from tokens.json.

### M06 — Networking clients
URLSession / OkHttp; envelope; requestId. Against **mocks**.

### M07 — Auth/session clients
Keychain/Keystore. Against Production **only after Gate 1**. No destructive automated logins.

### M08 — Navigation shells
Five tabs + gates.

### M09 — Deep-link foundations
Router + allowlist; Milestone 1 Debug uses Production API.

### M10 — Push foundations
Permission + token plumbing; send depends on B14/B15.

---

## Product screens (after Gate 1 + M07)

| ID | Screen IDs | Deps |
|---|---|---|
| P01 | AUTH.* | M07, B03 |
| P02 | ONB.*, BILL.PAYWALL (flag) | P01, B03 |
| P03 | HOME.ROOT | B08/B09 snapshot |
| P04 | CAP.* | B06, B12 |
| P05 | INV.* | B06 |
| P06 | DEM.* | B07 |
| P07 | MAT.* | B08 |
| P08 | interest UX (if not in P07/P10) | B08 |
| P09 | VAL.* | B09 |
| P10 | OPP.* | B09 |
| P11 | REV.DETAIL | B09 |
| P12 | ACT.LIST | B10 |
| P13 | AGT.THREAD | B11 |
| P14 | ACC.* | B17 for delete UI (can ship privacy without wipe) |
| P15 | CRM.* | B19 |
| P16 | CAT.HOME | B19 |
| P17 | NET.INTEL | B19 |

P08 may merge into P07/P10 — do not duplicate.

---

## Package DoD (short form — every PR)

1. Scope respected.  
2. Tests listed in package exist and pass.  
3. Security checks from 04 if touching authz.  
4. Web `npm test` if Exchange `src/` changed.  
5. No Production Mobile pointing.  
6. RTL not regressed on touched screens.  
7. Rollback described.
