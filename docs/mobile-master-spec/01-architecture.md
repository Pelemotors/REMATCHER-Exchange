# 01 — Architecture

**Baseline:** Production `6e1eda818b0daf567785953aa656711569f62179`  
**Do not implement.**

---

## 1. System context

```
                    ┌─────────────────────────────────┐
                    │  REMATCHER-Exchange (existing)  │
                    │  Next.js Web + Prisma + PG 16   │
                    │  Matching, Privacy, Agent 4.1   │
                    │  /api/*  (Web, cookies)         │
                    │  /api/v1/* (Mobile, planned)    │
                    └──────────────┬──────────────────┘
           Field Test :3100        │         Production :3200
           DB :5435                │         DB :5436
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     iOS SwiftUI            Android Compose         Web (unchanged)
     Keychain               Keystore                NextAuth cookies
     APNs                   FCM                     Web Push
```

Mobile clients talk **only** to REMATCHER HTTPS APIs.  
No PostgreSQL, no OpenAI, no Prisma, no Capacitor.

---

## 2. Current Production (evidence)

| Layer | Reality |
|---|---|
| App | Next.js 15, systemd `:3200`, Caddy TLS |
| Data | Prisma → Docker `postgres:16-alpine` `127.0.0.1:5436` `rematcher_exchange` |
| Media | VPS disk `MEDIA_ROOT=/srv/gal/rematcher-exchange/media` + `GET /api/media` |
| Auth | NextAuth JWT cookie, 30 days, not revocable |
| AI | OpenAI via server Agent + intake vision |
| Email | Resend |
| Push | Web Push VAPID; APNs/FCM credentials unset |
| Field Test | Isolated `:3100` / DB `:5435` |

**Database strategy:** keep Prisma + local PostgreSQL. Do **not** migrate to Supabase because old docs mention it. Any hosting change is an architecture proposal, not a Mobile prerequisite.

**Vercel:** leftover (`vercel.json`). Not the Production runtime.

---

## 3. Target Mobile backend

```
iOS / Android
    → HTTPS /api/v1/**
        → auth context (userId, dealerId from server)
        → existing src/services/**
        → Prisma → PostgreSQL
```

Classification for backend work (from Phase 3B):

| | |
|---|---|
| KEEP | Postgres, Prisma, matching engine, interest, reveal, Action Gateway, entitlements model |
| WRAP/ADAPT | Inventory, Demand, Matches, Validation, Opportunity, Agent HTTP, notifications, media GET |
| REFACTOR | Push delivery, pagination, device registry usage |
| NEW | Mobile credential store, `/api/v1` door, error envelope, APNs/FCM sender, deletion job |

Web `/api/*` stays. v1 is additive and cookie-free.

---

## 4. Proposed repository: REMATCHER-Exchange-Mobile

Do **not** create this repo until Gate 0 is approved.

### Final structure (preferred over a nested `android/REMATCHER/` app folder)

Gradle expects an `app` module. Xcode expects a project at `ios/`. Shared truth lives in `contracts/`, not in a UI framework.

```
REMATCHER-Exchange-Mobile/
├── README.md
├── LICENSE
├── .gitignore
├── contracts/                     # Source of Truth consumed by both apps
│   ├── api/
│   │   ├── openapi.yaml           # /api/v1 (added when B01 lands)
│   │   ├── error-codes.json
│   │   └── pagination.md
│   ├── product/
│   │   ├── screens.yaml
│   │   ├── states.yaml
│   │   └── copy-he.yaml
│   ├── design/
│   │   └── tokens.json            # names + values from brand-v2
│   ├── events/
│   │   └── notification-events.yaml
│   └── deep-links/
│       └── routes.yaml
├── docs/                          # human specs; may mirror this folder
├── scripts/
│   ├── check-contracts.sh
│   └── export-tokens.py
├── ios/
│   ├── REMATCHER.xcodeproj
│   ├── REMATCHER/
│   ├── REMATCHERTests/
│   └── REMATCHERUITests/
└── android/
    ├── settings.gradle.kts
    ├── build.gradle.kts
    ├── gradle.properties
    └── app/                       # applicationId co.rematcher.exchange
        ├── src/main/
        ├── src/fieldTest/
        └── src/production/
```

**Why not share UI code:** SwiftUI and Compose are the products. Sharing a React/Kotlin Multiplatform UI would violate locked decisions. What is shared is **contracts**.

**Why Gradle `app/` not `android/REMATCHER/`:** Android Studio / AGP convention, product flavors, and Play App Signing all assume `app`. The human name of the app remains REMATCHER.

**Why contracts live in the Mobile repo:** iOS and Android review the same PR when a token or error code changes. Backend OpenAPI is authored in Exchange and **copied or submodule-synced** into `contracts/api/` — exact sync mechanism is an open technical decision (see 16). Recommendation: generate OpenAPI in Exchange, commit a snapshot in Mobile `contracts/api/` per backend SHA.

---

## 5. Shared contract, not shared UI

Identical across iOS and Android:

- API paths, JSON shapes, error codes
- product states (match interest, vehicle status, demand uxStatus)
- notification event names from the domain
- deep-link paths (already in `src/lib/deep-links.ts`)
- design token **names and hex**
- Hebrew copy where the product already has it
- acceptance criteria

Not shared:

- View trees
- navigation primitives (NavigationStack vs NavHost)
- push SDK wiring
- image cache implementation (NSCache vs Coil)

---

## 6. Environments

| Env | API host | DB | Used by Mobile? |
|---|---|---|---|
| Development | local Exchange or Field Test | local/FT | yes (simulators) |
| Field Test / Staging | `https://field-test-exchange.rematcher.co.il` | Docker `:5435` | **yes — default integration** |
| Production | `https://exchange.rematcher.co.il` | Docker `:5436` | **TestFlight/Play production builds only** |

Mobile **never** uses Production as a developer sandbox.  
App Store / TestFlight production flavor must not silently fall back to Dev.

Configuration strategy: compile-time flavors (iOS xcconfig / Android productFlavors). **No secrets in the binary.** Only public base URL, bundle IDs, associated domains, log level.

Proposed identifiers (OPEN TECHNICAL — confirm with Apple/Google accounts):

| Flavor | iOS bundle | Android applicationId |
|---|---|---|
| Dev | `co.rematcher.exchange.dev` | `co.rematcher.exchange.dev` |
| Field Test | `co.rematcher.exchange.fieldtest` | `co.rematcher.exchange.fieldtest` |
| Production | `co.rematcher.exchange` | `co.rematcher.exchange` |

Capacitor already used `co.rematcher.exchange` — Production IDs should reuse that if the Apple/Google apps are to be the Store apps. Confirm in open decisions.

---

## 7. Production protection

- Additive `/api/v1` and new tables only.
- No breaking Prisma migration without plan, backup, Web regression, approval.
- Web cookie auth unchanged.
- Kill switches already exist (`matching_new`, `push`, `interest_new`, `reveal`, `dealer_memory`) — keep them server-side.
- Cron/`x-vercel-cron` hardening is a backend security package, not a Mobile screen.

---

## 8. Observability from day one

Every v1 response includes `requestId` (header `X-Request-Id` echo + error envelope).  
Every Mobile request sends:

- `X-Client-Platform`: `ios` | `android`
- `X-Client-Version`: semver
- `X-Client-Build`: build number
- `X-Client-Env`: `dev` | `fieldtest` | `production`

No PII in client logs. Crash reporter (optional later) must not ship Production user content. Recommendation: add Sentry/Crashlytics as a **Gate 5** decision, not a foundation dependency.
