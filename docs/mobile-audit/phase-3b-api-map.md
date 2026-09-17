# Phase 3B — API Map (appendix)

**Audited application SHA:** `6e1eda818b0daf567785953aa656711569f62179`  
**Working tree HEAD:** `3974c7517353c27e728d1c034d318c28bccf3705` (docs-only; `src/` identical to Production)  
**Routes:** 103 `src/app/api/**/route.ts`  
**Versioned surface:** none. There is no `/api/v1`.

Identity convention in existing routes: `dealerId` / `userId` almost always from session JWT. Entity IDs (`vehicleId`, `matchId`, `demandId`, …) from body/query/path.

---

## Auth helpers

| Helper | File | Meaning |
|---|---|---|
| `auth()` | `src/lib/auth.ts` | Dealer NextAuth JWT cookie |
| `adminAuth()` | `src/lib/admin-auth.ts` | Separate admin cookie |
| `requireSession` | `src/lib/auth-guards.ts` | user id required |
| `requireDealerSession` | same | + `dealerId` + entitlement row ensure |
| `requireVerifiedDealer` | same | + email verified + dealer VERIFIED/active + optional entitlement |
| `requireAdminSession` | same | admin cookie + `UserRole.ADMIN` |
| public | — | no session |

Middleware (`src/middleware.ts`) does **not** enforce auth. Catalog host rewrite only.

---

## 1. Auth & Identity

| Route | Methods | Auth | Notes |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | public (NextAuth) | Cookie session. Credentials + `bridgeToken`. |
| `/api/auth/signup` | POST | public | Creates User+Dealer+membership |
| `/api/auth/login-check` | POST | public | Email probe, rate-limited |
| `/api/auth/forgot-password` | POST | public | Always ok; rate-limited |
| `/api/auth/reset-password` | POST | public | Deletes Prisma `Session` rows (JWT cookies unaffected) |
| `/api/auth/verify-email` | GET, POST | public | token / resend |
| `/api/auth/google` | POST | public | idToken → `bridgeToken` 5 min |
| `/api/auth/apple` | POST | public | idToken → `bridgeToken` 5 min |
| `/api/auth/link/google` | POST | `auth()` | session userId |
| `/api/auth/link/apple` | POST | `auth()` | session userId |
| `/api/admin/auth/[...nextauth]` | GET, POST | public NextAuth admin | Separate cookie, 8h |

**Mobile target mapping:** do not reuse cookie NextAuth as the native contract. Keep these routes for Web. Add parallel `/api/v1/auth/*`.

---

## 2. Account / Me

| Route | Methods | Auth | Collection? |
|---|---|---|---|
| `/api/account/context` | GET | `auth()` | Closest to `/me` but not a full identity DTO |
| `/api/account/profile` | PATCH | `auth()` | |
| `/api/onboarding` | GET, PATCH | `auth()` | |
| `/api/dealer/members` | GET, POST | `requireVerifiedDealer` | |
| `/api/privacy/status` | GET | `auth()` | |
| `/api/privacy/consents` | GET, PATCH | `auth()` | |
| `/api/privacy/memory` | GET, DELETE | `auth()` | |
| `/api/privacy/memory/[id]` | PATCH, DELETE | `auth()` | |
| `/api/privacy/onboarding/complete` | POST | `auth()` | |
| `/api/privacy/account-deletion` | POST | `auth()` | request/confirm |

---

## 3. Inventory

| Route | Methods | Auth | Pagination |
|---|---|---|---|
| `/api/inventory` | GET, POST, PATCH | `auth()` + dealerId | offset `page`/`pageSize` max 100; filters; `q`; sort `updatedAt desc` |
| `/api/inventory/media` | GET, POST, PATCH, DELETE | `auth()` | |
| `/api/inventory/enrichment` | GET, POST | `auth()` | |
| `/api/inventory/import/preview` | POST | `requireVerifiedDealer` | |
| `/api/inventory/import/confirm` | POST | `requireVerifiedDealer` | |
| `/api/vehicles/visibility` | POST | `requireVerifiedDealer` | network publish/remove/convert |

Service layer exists: `src/services/inventory/*`. GET handler still duplicates list logic vs `list-inventory.ts`.

---

## 4. Intake

| Route | Methods | Auth |
|---|---|---|
| `/api/intake/batch` | GET, POST | `requireVerifiedDealer` |
| `/api/intake/intent` | POST | `requireVerifiedDealer` |
| `/api/intake/review` | GET, POST | `requireVerifiedDealer` |

Business logic: `src/services/intake/*`. Multipart → VPS disk.

---

## 5. Demand

| Route | Methods | Auth | Pagination |
|---|---|---|---|
| `/api/demands` | GET | `requireVerifiedDealer` | **unbounded** (`active`/`ended`/`all`) |
| `/api/demands/[id]` | GET, PUT | `requireVerifiedDealer` | |
| `/api/demands/lifecycle` | GET, POST, PATCH | `requireVerifiedDealer` | pause/resume/close |
| `/api/demands/parse` | GET, POST | `auth()` | AI parse |
| `/api/demands/confirm` | POST | `auth()` | PENDING_CONFIRMATION → ACTIVE |
| `/api/demands/duplicate-check` | POST | `requireVerifiedDealer` | |

Services: `src/services/demand/*`, `src/services/matching/search-intent-service.ts`.

---

## 6. Matching / Interest / Validation / Opportunity / Reveal

| Route | Methods | Auth | Pagination |
|---|---|---|---|
| `/api/matches` | GET, POST | `auth()` | implicit take 12 / 40 if `demandId` |
| `/api/opportunities` | GET, POST | `auth()` | **unbounded** |
| `/api/dealer-opportunities` | GET, POST | `requireVerifiedDealer` | take 30 |
| `/api/validations` | GET, POST | `auth()` | all PENDING |
| `/api/validations/b2b-price` | GET, POST | `auth()` | |
| `/api/reveals/[id]` | GET, POST | `auth()` | |

Services: `matching-flow.ts`, `engine-v2.ts`, `list-buyer-matches.ts`, `private-matching.ts`, `candidate-policy.ts`, `privacy-views.ts`.

---

## 7. Agent

| Route | Methods | Auth |
|---|---|---|
| `/api/assistant/chat` | GET, POST | `requireVerifiedDealer` (entitlement optional) |
| `/api/assistant/context` | GET | same |
| `/api/intelligence` | POST | `requireVerifiedDealer` |

No streaming. JSON only. Writes go through Action Gateway (`src/services/assistant/action-gateway.ts`).

---

## 8. Notifications / Push / Devices

| Route | Methods | Auth |
|---|---|---|
| `/api/notifications` | GET, PATCH | `auth()` | take 50 |
| `/api/notifications/preferences` | GET, PATCH | `auth()` |
| `/api/notifications/event-preferences` | GET, PUT | `auth()` |
| `/api/push/vapid` | GET | **public** (VAPID public key) |
| `/api/push/subscribe` | POST | `auth()` |
| `/api/push/unsubscribe` | POST | `auth()` |
| `/api/push/native-register` | POST, DELETE | `auth()` |
| `/api/push/status` | GET | `auth()` |
| `/api/push/telemetry` | POST | `auth()` |
| `/api/push/test-owner` | POST | `requireVerifiedDealer` |
| `/api/devices/register` | POST, PATCH | `requireDealerSession` | DeviceInstallation; IDs from session |
| `/api/devices/revoke` | POST | `requireSession` | **installationId not ownership-scoped** |

---

## 9. Media / Catalog / Customers / Commercial

| Route | Methods | Auth |
|---|---|---|
| `/api/media/[...key]` | GET | `auth()` + owner or buyer-visible match |
| `/api/catalog/me` | GET, POST | `requireVerifiedDealer` |
| `/api/catalog/publish` `/unpublish` `/bulk-publish` | POST | `requireVerifiedDealer` |
| `/api/catalog/slug-available` | GET | `requireDealerSession` |
| `/api/catalog/logo` | POST | `requireVerifiedDealer` |
| `/api/catalog/finance` | POST | `requireVerifiedDealer` |
| `/api/catalog/tls-ask` | GET | public (Caddy) |
| `/api/customers` | GET, POST | `requireVerifiedDealer` | take 50, max 100 |
| `/api/commercial/usage` | GET | `auth()` |

---

## 10. Billing

| Route | Methods | Auth |
|---|---|---|
| `/api/billing/paywall` | GET | `requireDealerSession` |
| `/api/billing/apple/verify` | POST | `requireDealerSession` |
| `/api/billing/google/verify` | POST | `requireDealerSession` |
| `/api/billing/restore` | POST | `requireDealerSession` |
| `/api/billing/webhooks/apple` | POST | public + JWS |
| `/api/billing/webhooks/google` | POST | public + HMAC |

`MONETIZATION_ENABLED` unset in Production → entitlements not enforced.

---

## 11. Admin / Ops / Misc

Admin routes under `/api/admin/**` use `requireAdminSession` except login/auth/login-hint.

| Route | Notes |
|---|---|
| `/api/health` | public |
| `/api/app/version-check` | public |
| `/api/events/interaction` | `auth()`; **dealerId from body** |
| `/api/cron/lifecycle` | CRON_SECRET **or** `x-vercel-cron` **or** admin session. Production `CRON_SECRET` is unset. |

**Missing product API:** `/api/activity` (UI route + deep link only).

---

## Recommended `/api/v1` wrap (not implemented)

| v1 resource | Wrap existing |
|---|---|
| `POST /api/v1/auth/login` | credentials authorize + new refresh store |
| `POST /api/v1/auth/refresh` | **new** |
| `POST /api/v1/auth/logout` | **new** revoke |
| `GET /api/v1/me` | `sessionPayloadFromUser` + `account/context` + entitlement |
| `GET/POST /api/v1/inventory` | `list-inventory` / `create-vehicle` / `update-vehicle` |
| `GET /api/v1/demands` | `demand-queries` + cursor |
| `GET /api/v1/matches` | `listBuyerMatches` |
| `POST /api/v1/matches/:id/interest` | `recordBuyerInterest` |
| `GET /api/v1/opportunities` | seller opportunity query + privacy view |
| `GET/POST /api/v1/validations` | existing validation services |
| `GET/POST /api/v1/reveals/:id` | `getRevealForDealer` |
| `GET /api/v1/notifications` | prisma notification + cursor |
| `POST /api/v1/agent/turns` | `runExchangeAssistantV2` |
| `POST /api/v1/intake/batches` | intake services |
| `POST /api/v1/devices` | `registerOrUpdateInstallation` with ownership |

Do not expose admin, catalog TLS, cron, or raw Prisma to Mobile.
