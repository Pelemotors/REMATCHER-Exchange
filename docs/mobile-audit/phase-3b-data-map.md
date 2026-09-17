# Phase 3B — Data Map (appendix)

Technical inventory of data Mobile **may** COLLECT / STORE / TRANSMIT / SHARE WITH PROCESSOR.  
Not an App Store or Play Store declaration. Unknown = UNKNOWN.

**Audited SHA:** `6e1eda818b0daf567785953aa656711569f62179`

Processors observed in code: OpenAI, Resend, data.gov.il (GOV plate), Web Push push services, Apple/Google identity (optional), Apple/Google billing (code present, monetization off).  
Not used: Stripe, Firebase SDK, Supabase Auth/Storage/Realtime/Edge, S3.

Retention numbers below come from `src/services/privacy/policy.ts` `getRetentionPolicy()` when listed. Account deletion currently does **not** apply them (see main report).

---

## Account

| | |
|---|---|
| Classes | User id, email, passwordHash or OAuth-only, name, role, accountStatus, emailVerifiedAt |
| Source | Signup / OAuth / admin |
| Destination | PostgreSQL `User` |
| Purpose | Login, identity |
| Retention | POLICY DECISION REQUIRED for deletion; password reset exists |
| Mobile | COLLECT (credentials) · STORE (tokens in OS keychain — not yet implemented) · TRANSMIT to REMATCHER API |
| Processor | None for password auth. Apple/Google if OAuth enabled |

## Contact details

| | |
|---|---|
| Classes | User.phone, Dealer.phone, Dealer.email, contactName |
| Source | Signup / profile |
| Destination | PostgreSQL |
| Purpose | Dealer profile, reveal counterparty after mutual interest |
| Retention | UNKNOWN / POLICY DECISION REQUIRED |
| Mobile | COLLECT · TRANSMIT · STORE locally only as cache if implemented |
| Processor | Resend for email; not SMS in current code |

## Dealer / business details

| | |
|---|---|
| Classes | businessName, city, region, businessId, verificationStatus, catalog slug/logo |
| Source | Signup / catalog APIs / admin approve |
| Destination | `Dealer`, `DealerCatalog` |
| Purpose | Verification, public catalog, session display |
| Mobile | COLLECT · TRANSMIT |
| Public catalog | Separate from Network Visibility; public pages exist |

## Inventory

| | |
|---|---|
| Classes | Vehicle make/model/year/trim/mileage/color/prices/plate-related identity JSON/status/freshness |
| Source | Intake, manual create, import, Agent Action Gateway |
| Destination | `Vehicle`, `VehicleMedia`, disk under MEDIA_ROOT |
| Purpose | Matching, catalog, dealer ops |
| Retention | policy: historical inventory 36 months (dry-run only; not enforced on deletion) |
| Mobile | COLLECT · TRANSMIT · STORE (images on device camera roll UNKNOWN — client choice) |
| Cross-dealer | Buyer sees privacy view only until Reveal |

## Demand

| | |
|---|---|
| Classes | Demand JSON, SearchIntentVersion, constraints, status, expiry |
| Source | Parse/confirm/Agent |
| Destination | `Demand`, `SearchIntentVersion`, `DemandConstraint` |
| Purpose | Matching |
| Retention | policy 36 months historical |
| Mobile | COLLECT · TRANSMIT |

## Images

| | |
|---|---|
| Classes | Intake media, vehicle display/thumb WebP, catalog logo |
| Source | multipart upload |
| Destination | VPS disk `MEDIA_ROOT=/srv/gal/rematcher-exchange/media`; keys in DB |
| Purpose | Intake OCR/vision, inventory, catalog |
| Auth serve | `GET /api/media/*` session + ownership or buyer-visible match |
| Mobile | COLLECT · TRANSMIT to API · STORE on disk server-side |
| Processor | OpenAI Vision for OCR/classify (downscaled). Not stored at OpenAI (UNKNOWN if OpenAI retains per their policy) |

## License plate

| | |
|---|---|
| Classes | OCR tokens, GOV lookup identity, stored on VehicleCandidate / Vehicle identity JSON |
| Source | photos + data.gov.il |
| Destination | PostgreSQL; image files on disk |
| Purpose | identity resolution for intake |
| Mobile | COLLECT (camera) · TRANSMIT |
| Processor | OpenAI Vision; data.gov.il |

## Device identifiers

| | |
|---|---|
| Classes | `DeviceInstallation.installationId`, platform, appVersion, buildNumber |
| Source | `/api/devices/register` |
| Destination | PostgreSQL |
| Purpose | install registry (unused by push delivery today) |
| Count in Production | 0 rows |
| Mobile | COLLECT · TRANSMIT |
| Processor | none |

## Push token

| | |
|---|---|
| Classes | Web Push endpoint+p256dh+auth; native `apns://` / `fcm://` in `PushSubscription`; `DeviceInstallation.pushToken` |
| Source | subscribe / native-register / devices/register |
| Destination | PostgreSQL |
| Purpose | delivery |
| Production | Web Push configured (VAPID). APNs/FCM credentials **not set**. DeviceInstallation=0, PushSubscription=1 |
| Mobile | COLLECT · TRANSMIT · SHARE WITH PROCESSOR (Apple APNs / Google FCM) when native sender exists |
| Processor today | Web Push service of the browser vendor |

## Agent conversations

| | |
|---|---|
| Classes | message text, ConversationState in `DealerMemoryItem`, tool results, AiOperationLog metadata |
| Source | `/api/assistant/chat` |
| Destination | PostgreSQL; OpenAI Chat Completions |
| Purpose | dealer assistant |
| Retention | policy 24 months conversations (not applied on deletion beyond `forgetAllMemoryForDealer`) |
| Mobile | COLLECT · TRANSMIT · SHARE WITH PROCESSOR (OpenAI) |
| Consent | Privacy AI onboarding + DEALER_MEMORY consent |

## Diagnostics

| | |
|---|---|
| Classes | `/api/health` (commit, kill switches, not PII); push telemetry; AppEvent; AiOperationLog |
| Source | clients / server |
| Destination | PostgreSQL |
| Purpose | ops |
| Mobile | TRANSMIT if wired |
| PII in logs | UNKNOWN completeness; AiOperationLog documented as not storing full prompts |

## Analytics

| | |
|---|---|
| Classes | `AppEvent`, `PRODUCT_EVENTS`, `/api/events/interaction` |
| Third-party product analytics SDK | **not found** |
| Mobile | TRANSMIT to REMATCHER only unless a future SDK is added |

## Payments

| | |
|---|---|
| Classes | `DealerSubscription`, `ProviderTransaction`, `DealerEntitlement` |
| Status | code for Apple IAP + Google Play Billing; Production monetization **off** |
| Stripe | not present |
| Mobile | none until entitlements on |
| Processor | Apple / Google if enabled |

## Location

| | |
|---|---|
| GPS | **not found** in API/schema |
| Region/city | dealer-entered strings |
| Mobile | do not collect GPS unless a future product decision |

---

## Account deletion vs data class (current code)

`confirmAccountDeletion` today: forget dealer memory, delete push subscriptions for members, set `Dealer.isActive=false` + `verificationStatus=DISABLED`, mark request COMPLETED.

| Data class | Current fate | Required for Store (recommendation, not legal advice) |
|---|---|---|
| User | RETAIN | POLICY DECISION REQUIRED |
| Sessions/JWT | RETAIN (JWT not revoked; Session table empty) | DELETE/revoke |
| Dealer | ANONYMIZE-ish (disabled flag only) | POLICY DECISION REQUIRED |
| Inventory/Vehicles | RETAIN | POLICY DECISION REQUIRED |
| Demand | RETAIN | POLICY DECISION REQUIRED |
| Matches/Interest/Opportunity/Reveal | RETAIN | POLICY DECISION REQUIRED |
| Activity/AppEvent | RETAIN | POLICY DECISION REQUIRED |
| Agent memory | DELETE (forget) | |
| Agent logs | RETAIN | POLICY DECISION REQUIRED |
| Uploads/media | RETAIN on disk | DELETE or ANONYMIZE |
| Notifications | RETAIN | DELETE |
| Entitlements | RETAIN | POLICY DECISION REQUIRED |
| Legal/consent | RETAIN | RETAIN often required — POLICY DECISION REQUIRED |
| External processors | OpenAI/Resend/Web Push: no deletion fan-out | POLICY DECISION REQUIRED |

---

## Production row counts (no PII)

Read-only Prisma against Production Postgres `rematcher_exchange` @ `127.0.0.1:5436`, 2026-09-17:

| Model | Count |
|---|---|
| User | 6 |
| Dealer | 4 |
| DealerMembership | 4 |
| Vehicle | 31 |
| Demand | 15 |
| CandidateMatch | 17 |
| SearchIntentVersion | 14 |
| SellerOpportunity | 2 |
| Reveal | 2 |
| ValidationEvent | 9 |
| Notification | 23 |
| PushSubscription | 1 |
| DeviceInstallation | 0 |
| Session | 0 |
| IntakeBatch | 164 |
| VehicleMedia | 30 |
| DealerEntitlement | 4 |
| AiOperationLog | 283 |
| AccountDeletionRequest | 0 |
