# 04 — Auth & Security

Web NextAuth cookies **stay**. This document specifies the **Mobile** credential layer only.

---

## 1. Properties

| Property | Mobile rule |
|---|---|
| Access | short-lived (recommendation **15 minutes**) opaque or signed token |
| Refresh | longer-lived (recommendation **30 days**) **hashed at rest**, rotatable, revocable |
| Logout | deletes/rotates refresh; access dies at expiry or denylist if implemented |
| Identity | `userId` + `dealerId` resolved from token row **and live DB** every request |
| Suspension | `User.accountStatus !== ACTIVE` → no login, no refresh |
| Disabled dealer | `Dealer.isActive=false` or `DISABLED` → `PERMISSION_DEALER_DISABLED` |
| Password reset | revoke **all** Mobile refresh rows; Web JWT denylist or password-change epoch (open tech) |
| Email verify | existing tokens; Mobile shows `AUTH.VERIFY` |
| OAuth | Apple/Google idToken → v1 session (not 5-min cookie bridge as the session) |
| Deletion | `reauthenticate` then request/confirm |
| No 30-day unrevocable bearer | **hard rule** |

Prisma `Session` is unused for dealer JWT today (Production count 0). Do not pretend it revokes Web cookies. Mobile refresh rows are a **new** table (schema planned in B02, not migrated in this phase).

Conceptual model (no SQL in this phase):

```
MobileRefreshSession
  id, userId, dealerId
  tokenHash, familyId
  installationId?
  createdAt, expiresAt, rotatedAt, revokedAt, lastUsedAt
  userAgent / platform
```

Access token carries `sub` (userId) + `sid` (session id) + short `exp`. Server ignores client `dealerId`.

---

## 2. Lifecycle

```
Login/OAuth success
  → check accountStatus, dealer active, (optionally email)
  → issue access + refresh
  → GET /me for gates (verify / pending / privacy-ai / paywall)

Access expired
  → refresh once; on AUTH_REFRESH_EXPIRED → AUTH.LOGIN

Refresh reused after rotation (theft)
  → revoke family; force login

Logout
  → revoke this refresh family

Password reset / admin freeze / deletion confirm
  → revoke all families for user
```

`GET /me` returns gate flags so the app does not guess:

```json
{
  "user": { "id": "…", "email": "…", "name": "…" },
  "dealer": { "id": "…", "businessName": "…", "verificationStatus": "VERIFIED", "isActive": true },
  "gates": {
    "emailVerified": true,
    "privacyAiComplete": true,
    "entitled": true,
    "onboardingComplete": true
  }
}
```

---

## 3. Authorization rule

**Identity comes from authenticated server context.**

Forbidden: trusting body/query `dealerId` | `userId` | `ownerId` to select the tenant.  
Allowed: entity ids (`vehicleId`, `matchId`) **after** `where: { dealerId: ctx.dealerId }`.

Fix as part of B04 (before Mobile integration), even on old `/api/*` where cheap:

- `POST /api/events/interaction` — dealerId from session only
- `POST /api/devices/revoke` — **P0 IDOR**: `installationId` must belong to `userId`

---

## 4. Authorization test matrix (must exist before Gate 1)

Actors: Dealer A, Dealer B, Admin (admin cookie only), Suspended dealer, Anonymous.

| Resource | A | B accessing A's id | Admin via v1 | Suspended | Anonymous |
|---|---|---|---|---|---|
| Inventory GET/PATCH | own | 404/403 | 401/403 | 403 | 401 |
| Demand | own | 404 | deny | 403 | 401 |
| Matches list | own privacy DTO | cannot see B's | deny | 403 | 401 |
| Opportunity | own vehicles | 404 | deny | 403 | 401 |
| Validation | own | 404 | deny | 403 | 401 |
| Reveal | party only | 403 | deny | 403 | 401 |
| Activity/notifications | own user | 404 | deny | 403 | 401 |
| Media | owner or buyer-visible match | 403 | deny | 403 | 401 |
| Agent turn | own dealer tools | cannot pass other dealerId | deny | 403 | 401 |
| Devices register/revoke | own | 403 | deny | 403 | 401 |
| Account deletion | owner + reauth | 403 | deny | 403 | 401 |

Admin APIs remain on `/api/admin` with the **admin** cookie. Dealer v1 must never honor `role=ADMIN` to read another dealer.

---

## 5. Security gates (Gate 1 exit)

- [ ] Dealer A cannot access Dealer B (integration tests, not mocks-only)
- [ ] Suspended cannot login or refresh
- [ ] Revoked refresh fails
- [ ] Client `dealerId` in body is ignored
- [ ] Media ownership
- [ ] Device revoke ownership
- [ ] Reveal / validation / opportunity privacy DTOs
- [ ] Agent actions use ctx.dealerId
- [ ] Admin boundary
- [ ] Rate limits on login/signup/forgot/intake/agent
- [ ] No OpenAI keys / AUTH_SECRET / DATABASE_URL in Mobile binaries
- [ ] Milestone 1 Debug `API_BASE_URL` is `https://exchange.rematcher.co.il`

---

## 6. iOS / Android storage

| | iOS | Android |
|---|---|---|
| Refresh | Keychain `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | Encrypted SharedPreferences / Keystore |
| Access | memory + Keychain | memory + Encrypted prefs |
| Installation ID | Keychain UUID | Keystore-backed UUID |

No refresh token in `UserDefaults`, logs, or crash reports.

---

## 7. CORS / CSRF

Native apps do not use browser cookies for v1. Prefer **Bearer only** on `/api/v1` so CSRF is irrelevant. Do not enable a wide CORS `*` for v1. If a future Web admin SPA needs v1, lock origins explicitly — out of V1 scope.
