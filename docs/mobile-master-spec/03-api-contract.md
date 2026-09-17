# 03 — Mobile API Contract (`/api/v1`)

**Do not implement.** Additive to existing `/api/*`. Cookie NextAuth remains for Web.

Identity is **never** taken from client `dealerId` / `userId` / `ownerId` when the session can provide it.

Envelope success: resource JSON + optional pagination object.  
Envelope error: see Error Contract below. Always echo `X-Request-Id`.

Pagination (collections):

```json
{
  "items": [],
  "page": {
    "limit": 30,
    "nextCursor": "opaque-or-null",
    "hasMore": false,
    "sort": "updatedAt:desc"
  }
}
```

Default `limit=30`, max `100`. **No silent truncation.** If a domain today uses `take: 12`, v1 must either page or return `hasMore`.

---

## Error envelope

```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "פג תוקף החיבור. התחבר מחדש.",
    "requestId": "req_…"
  }
}
```

`message` is for display. UI state uses `code` only.

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_INVALID_JSON`, `VALIDATION_INVALID_REQUEST` |
| 401 | `AUTH_UNAUTHENTICATED`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_REVOKED`, `AUTH_REFRESH_EXPIRED` |
| 403 | `PERMISSION_EMAIL_UNVERIFIED`, `PERMISSION_DEALER_UNVERIFIED`, `PERMISSION_ACCOUNT_SUSPENDED`, `PERMISSION_DEALER_DISABLED`, `PERMISSION_FORBIDDEN`, `PERMISSION_REAUTH_REQUIRED` |
| 404 | `RESOURCE_NOT_FOUND` |
| 409 | `MATCH_VEHICLE_UNAVAILABLE`, `MATCH_STALE_OPPORTUNITY`, `RESOURCE_CONFLICT` |
| 422 | `VALIDATION_FAILED` (+ `details[]` `{field,code}`) |
| 429 | `RATE_LIMIT_EXCEEDED` |
| 402 | `ENTITLEMENT_REQUIRED`, `REVEAL_ALLOWANCE_EXHAUSTED` |
| 5xx | `SERVER_INTERNAL`, `AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`, `MEDIA_UNAVAILABLE` |

Keep Web `/api/*` strings as-is.

---

## Endpoint map

Auth requirement: `none` | `user` | `dealer` | `verifiedDealer` | `reauth`.

Classification: WRAP existing service · ADAPT DTO/pagination · REFACTOR shared layer · NEW.

### Auth / Me

| Method | Path | Auth | Request | Response | Errors | Page | Ownership | Underlying | Class |
|---|---|---|---|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | none | `{email,password,installationId?}` | `{accessToken,refreshToken,expiresIn,user}` | AUTH_*, PERMISSION_ACCOUNT_SUSPENDED, RATE_LIMIT | — | — | NextAuth authorize + **new** token store | NEW |
| POST | `/api/v1/auth/refresh` | refresh token | `{refreshToken}` | new pair (rotation) | AUTH_REFRESH_EXPIRED, AUTH_TOKEN_REVOKED | — | token row | NEW | NEW |
| POST | `/api/v1/auth/logout` | user | `{refreshToken?}` | `{ok}` | AUTH_* | — | own tokens | NEW | NEW |
| GET | `/api/v1/me` | dealer | — | identity, dealer, verification, entitlement, privacyAiComplete | AUTH_*, PERMISSION_* | — | session | `sessionPayloadFromUser` + `account/context` + entitlement | ADAPT |
| PATCH | `/api/v1/me` | dealer | profile fields | me | VALIDATION_* | — | session | `account/profile` | WRAP |
| POST | `/api/v1/auth/forgot-password` | none | `{email}` | `{ok}` always | RATE_LIMIT | — | — | forgot-password | WRAP |
| POST | `/api/v1/auth/reset-password` | none | `{token,password}` | `{ok}` | RESOURCE_NOT_FOUND | — | — | reset-password + **revoke all mobile+web sessions** | ADAPT |
| POST | `/api/v1/auth/verify-email` | none | `{token}` | `{ok}` | RESOURCE_NOT_FOUND | — | — | verify-email | WRAP |
| POST | `/api/v1/auth/resend-verification` | none/user | `{email?}` | `{ok}` | RATE_LIMIT | — | — | verify-email POST | WRAP |
| POST | `/api/v1/auth/oauth/apple` | none | `{idToken,nonce?}` | same as login | AUTH_* | — | — | apple route + token store (not cookie bridge) | ADAPT |
| POST | `/api/v1/auth/oauth/google` | none | `{idToken}` | same as login | AUTH_* | — | — | google route + token store | ADAPT |
| POST | `/api/v1/auth/reauthenticate` | dealer | `{password}` or OAuth | `{reauthToken,expiresIn}` | AUTH_* | — | self | NEW (deletion, password change) | NEW |
| POST | `/api/v1/auth/signup` | none | existing signup fields | `{ok, requiresVerification}` | VALIDATION_* | — | — | signup | WRAP |

### Inventory

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| GET | `/api/v1/inventory` | verifiedDealer | cursor; filters `all\|active\|sold\|attention\|interest\|missing_price`; `q` | ADAPT `list-inventory` |
| POST | `/api/v1/inventory` | verifiedDealer | create vehicle | WRAP `create-vehicle` |
| GET | `/api/v1/inventory/{id}` | verifiedDealer | owner only | WRAP |
| PATCH | `/api/v1/inventory/{id}` | verifiedDealer | fields / sold / archive / reactivate | WRAP `update-vehicle` |
| POST | `/api/v1/inventory/{id}/visibility` | verifiedDealer | publish/remove/convert | WRAP visibility |
| GET/POST/DELETE | `/api/v1/inventory/{id}/media` | verifiedDealer | multipart; MIME/size as today | WRAP vehicle-media |

### Intake / Capture

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| POST | `/api/v1/intake/batches` | verifiedDealer | create batch | WRAP |
| GET | `/api/v1/intake/batches/{id}` | verifiedDealer | owner | WRAP |
| POST | `/api/v1/intake/batches/{id}/media` | verifiedDealer | multipart images | WRAP |
| POST | `/api/v1/intake/batches/{id}/text` | verifiedDealer | | WRAP |
| POST | `/api/v1/intake/intent` | verifiedDealer | `{batchId,candidateId,intent}` | WRAP apply-intent |
| GET | `/api/v1/intake/review` | verifiedDealer | pending batches | WRAP |

### Demand

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| GET | `/api/v1/demands` | verifiedDealer | cursor; filter active/ended | ADAPT `demand-queries` |
| GET | `/api/v1/demands/{id}` | verifiedDealer | owner | WRAP |
| PUT | `/api/v1/demands/{id}` | verifiedDealer | | WRAP |
| POST | `/api/v1/demands/parse` | dealer | text/image | WRAP |
| POST | `/api/v1/demands/{id}/confirm` | dealer | | WRAP |
| POST | `/api/v1/demands/{id}/lifecycle` | verifiedDealer | pause/resume/close | WRAP |
| POST | `/api/v1/demands/duplicate-check` | verifiedDealer | | WRAP |

### Matching / Interest / Validation / Opportunity / Reveal

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| GET | `/api/v1/matches` | verifiedDealer | cursor; `demandId?`; **privacy DTO** (no score/seller) | ADAPT `listBuyerMatches` |
| POST | `/api/v1/matches/{id}/interest` | verifiedDealer | `{action: interested\|reject, rejectReason?}` | WRAP `recordBuyerInterest` |
| GET | `/api/v1/opportunities` | verifiedDealer | cursor; seller privacy view | ADAPT |
| POST | `/api/v1/opportunities/{id}/interest` | verifiedDealer | | WRAP `recordSellerInterest` |
| GET | `/api/v1/dealer-opportunities` | verifiedDealer | attention feed | WRAP |
| GET | `/api/v1/validations` | dealer | PENDING + cursor | ADAPT |
| POST | `/api/v1/validations/{id}` | dealer | confirm/decline | WRAP |
| POST | `/api/v1/validations/b2b-price` | dealer | | WRAP |
| GET | `/api/v1/reveals/{id}` | dealer | buyer or seller only | WRAP `getRevealForDealer` |
| POST | `/api/v1/reveals/{id}/outcome` | dealer | | WRAP |

### Activity / Notifications / Devices / Account

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| GET | `/api/v1/notifications` | user | cursor; unread; category | ADAPT |
| POST | `/api/v1/notifications/{id}/read` | user | owner | WRAP |
| POST | `/api/v1/notifications/read-all` | user | | WRAP |
| GET/PUT | `/api/v1/notifications/preferences` | user | | WRAP |
| GET | `/api/v1/activity` | dealer | **NEW read model** from notifications+app events if product needs a distinct feed; V1 may alias notifications | NEW or WRAP |
| POST | `/api/v1/devices` | dealer | installationId, platform, pushToken, appVersion | WRAP DeviceInstallation **with session IDs** |
| POST | `/api/v1/devices/revoke` | user | own installationId or all | **REFACTOR** — must scope by userId (P0 IDOR today) |
| GET | `/api/v1/privacy` | dealer | consents, memory summary | WRAP |
| POST | `/api/v1/account/deletion` | reauth + owner | request / confirm | ADAPT + NEW revoke |

### Agent / Media / Secondary

| Method | Path | Auth | Notes | Class |
|---|---|---|---|---|
| GET | `/api/v1/agent/conversation` | verifiedDealer | server-stored state only | ADAPT — **ignore client conversation blob** |
| POST | `/api/v1/agent/turns` | verifiedDealer | `{message, context:{route,entityType,entityId}}` | WRAP `runExchangeAssistantV2` |
| GET | `/api/v1/media/{key}` | dealer | same ownership as `/api/media` | ADAPT — Bearer **or** keep cookie for Web |
| POST | `/api/v1/customers` GET list | verifiedDealer | cursor | ADAPT |
| GET/POST | `/api/v1/catalog` | verifiedDealer | | WRAP |
| POST | `/api/v1/intelligence` | verifiedDealer | aggregates only | WRAP |
| GET | `/api/v1/billing/paywall` | dealer | | WRAP |
| GET | `/api/v1/health` | none | subset of web health, no secrets | WRAP |

Admin, cron, catalog TLS-ask, push VAPID public for **web**, and fake billing dealerId payloads are **not** Mobile v1.

---

## Idempotency

Header `Idempotency-Key` required on:

- interest (buyer/seller)
- validation confirm
- demand confirm
- inventory create
- reveal outcome
- agent turns that execute Action Gateway writes
- deletion confirm

Safe to auto-retry: GET, device register, notification read.  
Must not auto-retry without key: the list above.

---

## OpenAPI

When B01 lands, publish `openapi.yaml` from Exchange and snapshot it into the Mobile `contracts/api/` folder. Clients must fail CI if they call undocumented paths.
