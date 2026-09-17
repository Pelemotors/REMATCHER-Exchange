# Phase 3B — Backend Contract Gap Analysis

**Status:** documentation only. No application code change, no `/api/v1`, no Mobile repo, no migration, no deploy.

Existing implementation is evidence, not a constraint. Reuse is recommended only where the architecture is already server-authoritative and Mobile-safe.

---

## 0. Repository identity

| Item | Value |
|---|---|
| pwd | `/srv/gal/rematcher-exchange/app` |
| Remote | `git@github.com:Pelemotors/REMATCHER-Exchange.git` |
| Branch | `rebuild/search-first-vnext` |
| HEAD | `3974c7517353c27e728d1c034d318c28bccf3705` |
| origin/main | `2af7959a2a4ceb5665c602113fdb4a39947692ef` |
| origin/rebuild/search-first-vnext | `6e1eda818b0daf567785953aa656711569f62179` |
| Production `GET https://exchange.rematcher.co.il/api/health` | `fullCommit=6e1eda818b0daf567785953aa656711569f62179` |

HEAD ≠ Production SHA. Diff `6e1eda8..HEAD` is **docs-only** (`docs/mobile-audit/*`). `src/`, Prisma, and package files match Production. Application audit baseline = **Production SHA `6e1eda8`**.

This is REMATCHER Exchange, not Ma-shachachti / `lead-resurrection-playground`.

---

## 1. Production database provenance

### Prisma

```
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Live Production (verified, no credentials)

| | |
|---|---|
| Provider | PostgreSQL **16.15** (Alpine) |
| How Prisma connects | `DATABASE_URL` / `DIRECT_URL` |
| Hostname | `127.0.0.1` |
| Host port | `5436` → container `5432` |
| Database name | `rematcher_exchange` |
| Process | Docker `rematcher-exchange-production-db` image `postgres:16-alpine` |
| App path | systemd `WorkingDirectory=/srv/gal/rematcher-exchange/app` → Prisma → that URL |

Read-only counts succeeded through the **application Prisma client** (Users, Dealers, Vehicles, Demands, Matches present). Provenance of live data:

**Application → Prisma → self-hosted PostgreSQL**

### Supabase — explicit split

**Supabase SDK is not used.** No `@supabase/*`, no `supabase/` client folder, no Auth/RLS/Storage/Realtime/Edge Functions in this app.

**Supabase-hosted PostgreSQL is not used by current Production.** Production is local Docker Postgres on `:5436`.

Docs that still say otherwise are **stale**:

- `.env.example` header “PostgreSQL via Supabase”
- `docs/ops/BACKUP_REALITY.md` project `qammtrqpnapmeerskhns` (eu-central-1)
- `docs/FIELD_TEST_ENVIRONMENT.md` still describes Production as Supabase/Vercel

Those documents do **not** match the running unit. Whether that cloud project still holds a historical copy is UNKNOWN and was not queried (no secrets printed; Supabase MCP unauthenticated). It is **not** the path `/api/health` + Prisma used today.

Supabase usage matrix for Exchange Production:

| Product | Used? |
|---|---|
| A. PostgreSQL hosting | **No** (self-host Docker) |
| B. Auth | No |
| C. RLS | No (app-level `dealerId` filters) |
| D. Storage | No (VPS disk) |
| E. Realtime | No |
| F. Edge Functions | No |
| G. Anything else in app code | Reserved slug `"supabase"` only |

Field Test is a **second** Docker Postgres: `127.0.0.1:5435` / `rematcher_exchange_field_test`. Isolated from Production.

---

## 2. Current vs target architecture

### Current (evidence)

```
Browser / PWA / Capacitor WebView
        │  HttpOnly cookies (NextAuth JWT, 30d)
        │  fetch /api/*  (unversioned, ~103 routes)
        ▼
Next.js 15 App Router
  ├── RSC pages (Web UI) → Prisma/services
  ├── Route Handlers      → mix of inline SQL + services
  └── middleware          → catalog host rewrite only (not auth)
        │
        ├── Prisma → PostgreSQL 16 (Docker :5436)
        ├── MEDIA_ROOT filesystem
        ├── OpenAI (Agent + intake vision)
        ├── Resend
        ├── web-push (VAPID)
        └── data.gov.il
```

Capacitor exists as a **remote WebView of the website**. It is not the native iOS/Android product. New apps must not use it as a base.

### Target (Mobile)

```
iOS (SwiftUI) / Android (Compose)
        │  short-lived access + revocable refresh
        │  no OpenAI keys, no DB, no cookies-as-sole-auth
        ▼
REMATCHER /api/v1/**
        ▼
existing service layer (matching, privacy, intake, Action Gateway)
        ▼
Prisma → PostgreSQL
```

Web Production keeps NextAuth cookies + existing `/api/*` until a compatibility window is designed. Mobile must not require breaking Web.

**Can we reach the target without cloning business logic?** Yes for domain: matching, privacy/reveal, intake, Action Gateway, entitlements model, inventory/demand mutations already live in `src/services/**`. No for the HTTP/auth/error/pagination contract — that layer is Web-shaped.

Recommended path: **A wrap services into `/api/v1`** after **B small shared refactors** (auth credential service, error envelope, cursor pagination). **C new implementation** only for Mobile session store, native push sender, and account-deletion job. Do not rebuild the matching engine.

---

## 3. Domain map (summary)

Full route table: `phase-3b-api-map.md`.

| Domain | Routes (examples) | Services | DB | Auth | Logic locus | Tests |
|---|---|---|---|---|---|---|
| Auth | `/api/auth/*`, admin auth | `oauth-bridge`, `session-from-user` | User, Session (unused for JWT), VerificationToken, ExternalIdentity | Cookies | Route + NextAuth | `auth-routing`, `identity-hardening`, `admin-session-separation` |
| Dealer/User | account, members, onboarding | `dealer-membership` | Dealer, Membership | session JWT `dealerId` | mixed | authorization (thin) |
| Inventory | `/api/inventory*` | `inventory/*` | Vehicle, VehicleMedia, InventoryImport | session | **split**: list duplicated in route vs `list-inventory.ts` | import, price-semantics |
| Intake | `/api/intake/*` | `intake/*` | IntakeBatch/Media, VehicleCandidate | verified dealer | service | intake-* |
| Demand | `/api/demands*` | `demand-*`, search-intent | Demand, SearchIntentVersion | mixed guards | service + route | duplicate-demand, phase2-my-searches |
| Matching | `/api/matches` | `engine-v2`, `matching-flow`, `list-buyer-matches` | CandidateMatch | session | **service** | matching-engine-2.0, lifecycle |
| Interest | matches POST, opportunities POST | `matching-flow` | BuyerInterest, SellerInterest, MutualInterest | session | service | bilateral-connection-flow |
| Validation | `/api/validations*` | inventory freshness + matching | ValidationEvent | session | mixed | buyer-visibility-enrichment |
| Opportunity | `/api/opportunities`, dealer-opportunities | `dealer-opportunity` | SellerOpportunity, DealerOpportunity | session | route-heavy GET | |
| Reveal | `/api/reveals/[id]` | `reveal-flow`, privacy-views | Reveal, RevealUsage | session | service | authorization reveal |
| Activity | **no API** | AppEvent / ExchangeEvent | AppEvent, ExchangeEvent | — | UI only | analytics-integrity |
| Agent | `/api/assistant/*` | agent-loop, v2-orchestrator, action-gateway | DealerMemoryItem, AiOperationLog | verified dealer | **service + gateway** | agent-4-1-* |
| Media | `/api/media`, inventory/media | `lib/media/*` | VehicleMedia + disk | session + ownership | service | |
| Notifications | `/api/notifications*` | `notifications/index` | Notification, prefs | user session | mixed | notifications.test |
| Push | `/api/push/*` | `push.ts`, `native-push.ts` | PushSubscription, PushDelivery | user session | service | push-ux |
| Entitlements | `/api/billing/*` | `entitlements`, billing providers | DealerEntitlement, Subscription* | dealer session; webhooks public | service | identity-monetization |
| Account deletion | `/api/privacy/account-deletion` | `privacy/deletion.ts` | AccountDeletionRequest | session | **incomplete service** | privacy-ai-v1-hard (consent, not full wipe) |
| Admin | `/api/admin/*` | `admin/*` | same DB | admin cookie | service | admin-control-center |
| Catalog | `/api/catalog/*` | `catalog-service` | DealerCatalog | verified | service | catalog-public-privacy |

---

## 4. Auth gap (critical)

### What exists

- NextAuth v5 Credentials, **JWT strategy**, `maxAge` **30 days**, cookie `__Secure-authjs.session-token`, HttpOnly, SameSite=lax.
- Admin: separate instance, 8 hours, `__Secure-admin-session-token`.
- OAuth Apple/Google → **5-minute** `bridgeToken` in `VerificationToken` → consumed by Credentials. Designed for Capacitor/WebView cookie minting, not a native refresh credential.
- Password reset deletes Prisma `Session` rows. Dealer auth **does not write** those rows (`Session` count in Production = **0**). Reset does **not** revoke JWT cookies.
- Logout = client `signOut()` (cookie clear). No server session denylist.
- `DeviceInstallation` revoke ≠ auth revoke.
- Dealer `authorize()` does **not** check `User.accountStatus` (SUSPENDED). Admin login does.
- `dealerId` is frozen in JWT at login. APIs trust `session.user.dealerId`. Membership changes are stale until re-login.
- No `Authorization: Bearer` acceptance on dealer APIs.
- Middleware does not gate APIs.

### Target vs current

| Target | Current |
|---|---|
| POST login / refresh / logout, GET me | Cookie NextAuth + `/api/account/context` (partial me) |
| Short-lived access | 30-day JWT |
| Revocable refresh | No |
| Native secure storage | Cookie jar / WebView |
| Server-derived identity | JWT claims + some DB re-reads |
| Reauth for sensitive actions | No step-up auth on deletion confirm |
| No secrets in Mobile | OK today (no NEXT_PUBLIC secrets of weight) |

### Client-supplied identity (security boundary)

Most routes correctly take `dealerId` from session. Exceptions:

| Location | Issue |
|---|---|
| `POST /api/events/interaction` | `dealerId` from **body** after user auth only — telemetry spoofing |
| `POST /api/devices/revoke` | `installationId` from body **without user ownership filter** — IDOR on device rows |
| Billing webhooks (fake mode) | `dealerId` in payload — expected for fake; Production mode must ignore client dealerId |
| Assistant chat | client may send `conversation` state merged with stored — client-influenced agent state, not dealer impersonation |

Entity IDs in body (`matchId`, `vehicleId`) are acceptable **if** services re-check ownership. That pattern is the right one; coverage of tests is uneven (many mocked `findFirst`).

### Recommendation (without breaking Web)

1. **Keep** NextAuth cookies for Web exactly as they are.
2. **Add** a Mobile credential service (new tables: refresh tokens hashed, device binding, revokedAt). Issue short-lived access tokens (minutes) accepted only under `/api/v1` via `Authorization`.
3. Derive `userId`/`dealerId` on every v1 request from the token record **plus live DB** (accountStatus, membership, dealer active). Do not trust JWT dealerId forever.
4. `GET /api/v1/me` = `sessionPayloadFromUser` + verification + entitlement.
5. Logout/refresh rotation/revocation must invalidate Mobile refresh. Optionally later, put dealer JWT jti in a denylist if Web needs the same.
6. Reuse `oauth-bridge` only as a short exchange into Mobile tokens, not as the session.
7. Do not embed Auth secrets in the apps. Apple/Google tokens go to existing `/api/auth/apple|google` then to v1 session.

This is **REBUILD of the Mobile auth contract**, **KEEP of Web NextAuth**, **KEEP of User/Dealer/Membership models**.

---

## 5. API contract classification

| Area | Class | Why |
|---|---|---|
| Inventory commands | **ADAPT** | Services exist; GET still presentation-shaped (Hebrew UX filters). Wrap `list-inventory` / mutations. |
| Demand | **ADAPT** | Unbounded list; parse/confirm are product-correct. |
| Matches | **ADAPT** | Good privacy DTO (`listBuyerMatches`). Hard limits 12/40 not a Mobile cursor. |
| Opportunities | **ADAPT** | Unbounded; GET in the route; `explanationJson` on seller payload — confirm Mobile should see ranking internals. |
| Validations | **ADAPT** | Thin routes, session-scoped. |
| Reveal | **KEEP** domain, **ADAPT** HTTP | `privacy-views` + ownership. |
| Activity | **REBUILD** | No API. |
| Account / me | **ADAPT** | Split across account/context, onboarding, privacy, paywall. |
| Agent HTTP | **ADAPT** | Server-authoritative already; needs v1 DTO, errors, no client conversation override. |
| Admin | **KEEP** off Mobile | Never expose. |
| Catalog public | **KEEP** Web | Out of dealer app scope unless product says otherwise. |

Presentation logic in APIs: Hebrew notification copy, inventory filter names, agent messages. Mobile should receive **codes + structured fields**; copy can stay server-side for V1 if stable, but error `message` must not be the only contract.

Cookie-coupled: every dealer route via `auth()`. Unsafe to call from native without a WebView cookie jar.

Missing for Mobile: refresh, paginated collections, activity, binary upload progress/resume, push delivery, versioned errors.

Dangerous to expose as-is: admin, cron, interaction dealerId, devices/revoke, raw assistant `conversation` blob, seller `explanationJson` if it leaks counterparty inference.

---

## 6. Error contract

No shared `ApiError`. Pattern: `NextResponse.json({ error: "Unauthorized" | domain_code }, { status })`. Sometimes `message`, sometimes `code`, sometimes Zod `details`.

Observed:

| HTTP | Examples |
|---|---|
| 400 | Invalid JSON/query/body, `rate_limited` also **429** on intake |
| 401 | Unauthorized |
| 402 | Subscription / `REVEAL_ALLOWANCE_EXHAUSTED` |
| 403 | Email not verified, dealer not verified, only_owner |
| 404 | Not found |
| 409 | `vehicle_unavailable`, `stale_opportunity` |
| 410 | `buyer_initiated_enrichment_disabled` |
| 429 | intake / auth rate limits |
| 5xx | uncaught throws |

Auth errors are English strings. Domain codes are mixed snake/SCREAMING.

**Proposed taxonomy for `/api/v1` (not implemented):**

```json
{ "error": { "code": "STABLE_MACHINE_CODE", "message": "human", "requestId": "..." } }
```

| HTTP | Codes (initial) |
|---|---|
| 400 | `INVALID_REQUEST`, `INVALID_JSON` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED` |
| 403 | `EMAIL_UNVERIFIED`, `DEALER_UNVERIFIED`, `ACCOUNT_SUSPENDED`, `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `VEHICLE_UNAVAILABLE`, `STALE_OPPORTUNITY`, `CONFLICT` |
| 422 | `VALIDATION_FAILED` (field errors array) |
| 429 | `RATE_LIMITED` |
| 402 | `NOT_ENTITLED`, `REVEAL_ALLOWANCE_EXHAUSTED` |
| 5xx | `INTERNAL`, `AGENT_UNAVAILABLE`, `UPSTREAM_OPENAI` |

Keep existing `/api/*` payloads for Web (backwards compatible). v1 is additive.

---

## 7. Pagination / filtering / sorting

| Collection | Today | Mobile risk |
|---|---|---|
| Inventory | offset page/pageSize≤100 | OK as V1; prefer cursor later |
| Demands | full list | unbounded |
| Matches | take 12/40 | silent truncation |
| Opportunities | all rows | unbounded |
| Dealer opportunities | take 30 | silent truncation |
| Notifications | take 50 | silent truncation |
| Validations | all PENDING | unbounded |
| Customers | 50/100 | OK-ish |
| Activity | none | |
| Agent history | memory item blob | not a collection API |

**Proposed v1 (not implemented):** cursor opaque (`createdAt,id`), default 30, max 100, `nextCursor`, stable `sort=createdAt|updatedAt|score` where domain allows. Inventory filters can stay as query enums.

---

## 8. Push architecture

Current:

```
Domain code → notifyDealerUsers → Notification row
                    ↓ (if prefs)
             deliverPushToUser → Web Push only
                    Native apns:// fcm:// rows skipped
```

- Web Push: configured in Production (`pushConfigured: true` on health; VAPID set).
- Native register: persists tokens; `sendNativePushToUser` returns `native_push_sender_pending_credentials`.
- APNs/FCM env **unset**.
- Two registries: `PushSubscription` (web + hacked native endpoints) and `DeviceInstallation` (closer to target; **0 rows**, unused by sender).
- Multi-device: Web Push already 1..n per user. DeviceInstallation unique on `installationId` — can support multi-device.
- Schema vs target: user/dealer/platform/token/appVersion/enabled(lastSeen/revoked) — **DeviceInstallation already has these**. Missing: invalid-token bounce handling (no APNs sender).
- Deep link on push: internal paths via `isSafeInternalPath`.

Real business events (map; do not invent new names as truth):

| Suggested mobile name | Actual code |
|---|---|
| MATCH_CREATED | `PRODUCT_EVENTS.MATCH_CREATED` / `MATCH_NOTIFIED`; notification `BUYER_MATCH`; trigger `MATCH_CREATED` |
| OPPORTUNITY_CREATED | seller opportunity creation + notify path in matching-flow |
| VALIDATION_REQUIRED | freshness / `VALIDATION_REQUIRED` + `notifyFreshnessAttention` |
| MUTUAL_INTEREST | `PRODUCT_EVENTS.MUTUAL_INTEREST`; type `MUTUAL_INTEREST` |
| REVEAL_AVAILABLE | `REVEAL_CREATED` / reveal notifications |
| AGENT_ACTION_REQUIRED | pending actions in agent context; not a first-class push type |
| SEARCH_EXPIRING | `DEMAND_EXPIRY` / `DEMAND_EXPIRING` |
| OUTCOME_REMINDER | `OUTCOME_REMINDER` |

**KEEP** `notifyDealerUsers` + privacy/prefs. **REFACTOR** delivery to Device Registry + APNs/FCM. Do not use Capacitor push plugins as the new app stack.

---

## 9. Deep links

Canonical builders: `src/lib/deep-links.ts` (match, opportunity, vehicle, validation, reveal, demand, activity, home). Safe prefix allowlist.

AASA + Digital Asset Links exist with **placeholder TEAMID / SHA256**. iOS entitlements mention production + field-test hosts.

Privacy: opening a link must still pass API ownership. Never skip auth because the link is “from a notification”.

Universal Links / App Links for native apps = **ADAPT** after real Apple Team ID and Android signing cert. Web paths can stay as `path` in push payload; native maps path → screen.

---

## 10. Upload / media

Verified: **VPS disk + `/api/media`**. `MEDIA_ROOT=/srv/gal/rematcher-exchange/media`. Public base `https://exchange.rematcher.co.il/api/media`. Sharp WebP, MIME allowlist jpeg/png/webp, 12MB, path traversal guards, authz owner or buyer-visible match. Intake keys include dealerId segment.

Current path Mobile would use: app → API multipart → disk. Same as Web.

**Recommendation: KEEP CURRENT FOR V1, MIGRATE LATER.**

Why not migrate before Mobile: Field Test + Production already share this model; object storage adds IAM, signed URL leakage, and dual-read complexity before the auth contract exists. Reliability risk today is single-VPS disk (backup UNKNOWN beyond host). That is a **P2/P3 reliability** item, not a Store blocker.

When migrating later: signed upload to object storage, DB stores key only, media GET becomes redirect or signed GET with same privacy checks.

Do not put license-plate images on a public CDN without the same authz.

---

## 11. Agent contract

Architecture **already** matches:

Mobile/Web → REMATCHER → Agent loop → Action Gateway → deterministic services → Prisma.

**Never** Mobile → OpenAI. No client OpenAI key.

Gaps: no streaming; 45s deadline; conversation GET/POST over cookie API; client can supply `conversation`; no dedicated agent rate limit.

What can leave REMATCHER to OpenAI **today** (categories, not live user rows):

| Category | Agent chat | Intake vision/OCR |
|---|---|---|
| Conversation text | yes | n/a |
| Dealer memory snippets | yes (if consent/runtime on) | no |
| Own inventory summaries via tools | yes (ids, prices, freshness labels) | no |
| Own demand summaries | yes | screenshot-demand images |
| Match/opportunity counts | yes | no |
| Counterparty identity | blocked by privacy views / fishing gate | no |
| Images | **not** in agent loop | **yes**, downscaled |
| License plates | if present in text/tools | **yes** (crop + vision) |
| Internal ids | vehicle/demand ids in tool JSON | batch ids |

`AiOperationLog` is supposed not to store full prompts. OpenAI retention = their policy = UNKNOWN here.

**KEEP** Agent 4.1 + Action Gateway. **ADAPT** HTTP for v1. Do not rebuild the brain to ship Mobile.

---

## 12. Account deletion & lifecycle

Today: owner `request` then `confirm` → memory wipe, push unsub, dealer disabled. No password reauth. JWT still valid. Vehicles, demands, matches, media, users, entitlements, legal rows remain. No job queue, no failure retry, no processor fan-out.

Immediate access revocation: **no**.

See `phase-3b-data-map.md` for DELETE/ANONYMIZE/RETAIN/UNRESOLVED per class. Legal retention = **POLICY DECISION REQUIRED**. Product retention numbers exist in `getRetentionPolicy()` but deletion does not execute them.

Store V1 cannot honestly claim full deletion. This is **P2 blocker for Production Store**, not for scaffolding clients.

---

## 13. Privacy / processors

See data map. Third parties in current code: OpenAI, Resend, data.gov.il, Web Push vendor, optional Apple/Google. No GPS. No Stripe. No generic analytics SDK found.

---

## 14. Billing / entitlements

| | |
|---|---|
| Monetization Production | **off** (`MONETIZATION_ENABLED` unset) |
| Entitlement model | real (`DealerEntitlement`, trial, founding, grace) — **KEEP** |
| IAP code | Apple + Google verify/webhooks/restore — live paths, fake mode for tests |
| Stripe | absent |
| Feature gates | `assertEntitled` no-ops when monetization off |
| Dead vs real | IAP is dormant commercially, not dead code |

Server-side entitlement should remain the source of truth if/when Store billing is turned on. Do not put “premium” only in the app.

---

## 15. Environment separation

| | API | DB | OpenAI | Email | Push | Media | Cron |
|---|---|---|---|---|---|---|---|
| Local | Next default | `.env` | if key | if key | if VAPID | `.media` | optional |
| Field Test | `field-test-exchange.rematcher.co.il` → `:3100` | Docker `:5435` | own env file (outside git) | own env | own env | field-test/media | not Production cron |
| Production | `exchange.rematcher.co.il` → `:3200` | Docker `:5436` | set | Resend set | VAPID set; APNs/FCM unset | `/srv/gal/rematcher-exchange/media` | `/api/cron/lifecycle`; `CRON_SECRET` **unset**; `x-vercel-cron` accepted |

Vercel Preview must **not** be used (docs: shares Production DB if used).

**Can Mobile develop without Production as sandbox?** **Yes, Field Test exists** — but it still speaks cookie `/api/*`, and Field Test docs/process must be confirmed for OpenAI/email isolation before giving native apps that base URL.

Not a full BLOCKER. Condition: **never point pre-release apps at Production**. Treat Field Test (or a future dedicated Mobile staging) as the only integration host.

Cron `x-vercel-cron` without secret on a public URL is a **security gap** on VPS (header may be spoofable unless Caddy strips it). `CRON_SECRET` unset in Production env.

---

## 16. Web compatibility of required changes

| Change | Web impact |
|---|---|
| Add `/api/v1` wrapping services | additive, no Web break |
| Mobile auth tables + Bearer on v1 only | additive |
| Shared error helper used only by v1 | additive |
| Cursor pagination on v1 | additive; keep offset on `/api/inventory` |
| Close interaction `dealerId` to session | tiny Web client fix |
| Ownership on devices/revoke | should not break honest clients |
| Check `accountStatus` on dealer login | **can lock suspended Web users — desired** |
| Deletion job | must not break live dealers; feature-flag |
| Native push sender | additive |
| Object storage | migration; dual-read needed — later |
| Moving business logic out of routes into services | shared refactor; regression risk; tests first |

Principle: Web Production stays up. v1 is a new door, not a replacement of `/api/*` in the same release.

---

## 17. Testability — required before connecting apps

Existing: 77+ Vitest files; strong matching/agent; **weak real IDOR** (many prisma mocks); Playwright hits Production Web.

Must exist before native integration (not implemented now):

1. Auth isolation: Dealer A token cannot read Dealer B inventory/demands/matches/media
2. Matching privacy DTOs on v1
3. Reveal rules
4. Token refresh + revocation
5. Suspended user rejected
6. Deletion: access gone after confirm (once deletion is real)
7. Upload ownership
8. Push recipient = membership users only
9. Agent cannot be pointed at another dealerId
10. Contract tests for error envelope + pagination

Do not use Production as the Mobile E2E backend.

---

## 18. Security boundary review (static)

| Finding | Severity for Mobile |
|---|---|
| Cookie JWT 30d, no revoke | P0 for native |
| No Bearer API | P0 |
| dealer login ignores SUSPENDED | P0/P1 |
| devices/revoke IDOR | P1 |
| events/interaction dealerId body | P1 integrity |
| cron `x-vercel-cron` OR missing CRON_SECRET | P1 ops |
| Client conversation blob to agent | P1 |
| Unbounded lists | P2 reliability |
| Media requires cookie auth — native must send v1 auth or media breaks | P0 contract |
| OpenAI sees plates/images/conversation | known; consent + privacy gate |
| Admin separated by cookie — keep off v1 | OK |
| Rate limit not global | P2 |
| Authorization tests mostly mocks | P0 test gap |

No exploitation was performed.

---

## 19. Classification matrix

| Subsystem | Current | Target | Classification | Risk | Mobile blocker? | Recommended action |
|---|---|---|---|---|---|---|
| Database | Docker Postgres 16 | same | **KEEP** | ops/backup docs stale | no | Ignore stale Supabase hosting docs |
| Prisma | sole DAL | sole DAL | **KEEP** | none | no | No client DB |
| Auth | NextAuth cookie JWT 30d | Bearer + refresh | **REBUILD** (mobile layer) | session theft, no revoke | **yes P0** | Additive mobile credentials; keep Web cookies |
| Dealer identity | JWT claim + membership | live DB on each request | **ADAPT** | stale dealerId | **yes P0** | Resolve from token record + membership |
| Inventory | REST + services | v1 | **ADAPT** | route/service drift | no | Wrap `list-inventory` / mutations |
| Demand | REST + services | v1 + cursor | **ADAPT** | unbounded GET | no | Wrap queries |
| Matching | engine 2.0 server | same | **KEEP** | silent take-limit | no | Wrap `listBuyerMatches` |
| Interest | matching-flow | same | **KEEP** | 402 codes inconsistent | no | Wrap record*Interest |
| Validation | REST | v1 | **ADAPT** | unbounded | no | Wrap |
| Opportunity | route-heavy GET | v1 + privacy | **ADAPT** | explanationJson | no | Move list to service; review DTO |
| Reveal | privacy-views | same | **KEEP** | none | no | Wrap getRevealForDealer |
| Activity | UI only | API | **REBUILD** | missing | no (V1 can skip) | New read API from AppEvent if needed |
| Agent | 4.1 HTTP JSON | v1 turns | **ADAPT** | 45s, client state | no | Wrap orchestrator; stop trusting client conversation |
| Action Gateway | deterministic writes | same | **KEEP** | none | no | Unchanged |
| Uploads | multipart disk | v1 multipart | **ADAPT** | VPS disk | no | KEEP disk V1 |
| Media storage | VPS + /api/media | authz URLs | **KEEP** V1 / migrate later | single disk | no | Dual-auth (cookie or v1) on GET |
| Notifications | in-app + web push | same + native | **ADAPT** | take 50 | no | Cursor + Device Registry |
| Push | VAPID; native stub | APNs/FCM | **REFACTOR** | no native delivery | **yes P1 TestFlight** | Unify DeviceInstallation + sender |
| Deep links | web paths + placeholder AASA | UL/App Links | **ADAPT** | placeholders | **yes P1** | Real Team ID / cert |
| Account deletion | disable dealer | policy job | **REBUILD** | Store compliance | **yes P2 Store** | Design with legal; then implement |
| Entitlements | real model, gating off | same | **KEEP** | IAP dormant | no | Keep server authority |
| API errors | ad-hoc strings | stable codes | **REBUILD** (v1 envelope) | client fragility | **yes P0** | Additive envelope |
| Pagination | mixed/unbounded | cursor | **REFACTOR** | silent truncation | P1 | v1 cursors |
| Environment separation | Field Test + Prod | same + never Prod sandbox | **ADAPT** | stale docs; cron auth | **yes P0 process** | Field Test only for integration |

---

## 20. Priorities

### P0 — before Mobile integration against a real API

1. Mobile auth: login/refresh/logout/me, short access, hashed refresh, revocation, live accountStatus/membership.
2. `/api/v1` door wrapping **existing services** (not a second matching engine).
3. Stable error envelope on v1.
4. Media GET accepts the same Mobile credential (or signed media URLs).
5. Authz tests Dealer A ≠ Dealer B on v1.
6. Process: Field Test (or dedicated staging) only — never Production as client sandbox.
7. Identity always from server session, never from client `dealerId`.

### P1 — before TestFlight / Closed Testing

1. APNs + FCM sender + DeviceInstallation as registry (multi-device).
2. Cursor pagination on list endpoints used by home/matches/inbox.
3. Real AASA / assetlinks.
4. Fix devices/revoke ownership; freeze interaction dealerId to session.
5. Suspended users cannot mint tokens (and preferably cannot cookie-login).
6. Cron auth: require `CRON_SECRET`; do not trust `x-vercel-cron` on VPS.
7. Agent v1: ignore client-supplied conversation as source of truth.

### P2 — before Production Store

1. Account deletion that matches a written policy (revoke access, media, processors).
2. Privacy nutrition labels from the data map (product/legal fill UNKNOWN).
3. Reauthentication for deletion.
4. If paid: IAP wired to existing entitlement ledger, not app-only flags.
5. Backup/restore runbook that names Docker Postgres, not stale Supabase.

### P3 — after V1

1. Object storage signed uploads.
2. Agent streaming.
3. Activity API.
4. Global rate limit.
5. Remove Capacitor as a product path (Web PWA may remain).

---

## 21. Top 10 gaps

1. **No native auth contract** (cookies/CSRF/30d JWT).
2. **No `/api/v1`** — 103 Web-shaped routes.
3. **No revocable sessions** (Session table unused; reset doesn’t kill JWT).
4. **Error strings, not codes.**
5. **Native push cannot deliver.**
6. **Account deletion is a flag flip, not a deletion.**
7. **Pagination is inconsistent / silent-truncated.**
8. **Device registry unused + revoke IDOR.**
9. **Stale identity in JWT; SUSPENDED not enforced on dealer login.**
10. **Docs still claim Supabase/Vercel Production — operators can aim at the wrong system.**

---

## 22. Decision: start Mobile clients now?

**YES WITH CONDITIONS**

Allowed now: scaffold REMATCHER-Exchange-Mobile (SwiftUI/Compose), navigation, local mocks, UI against a **frozen draft contract** from this document. Web stays as-is.

Not allowed as “integration”: pointing iOS/Android at `https://exchange.rematcher.co.il/api/*` cookies, or treating Capacitor as the app.

**Must happen first for real API integration (P0):** Mobile auth + `/api/v1` wrap of services + error envelope + Field Test as the only backend + A≠B tests.

Do not start that implementation until this report is approved and an Implementation Plan is written.

---

## 23. Files in this phase

- `docs/mobile-audit/phase-3b-backend-gap-analysis.md` (this file)
- `docs/mobile-audit/phase-3b-api-map.md`
- `docs/mobile-audit/phase-3b-data-map.md`
