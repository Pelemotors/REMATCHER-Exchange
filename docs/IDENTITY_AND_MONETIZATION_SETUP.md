# Identity & Monetization Setup

Foundation for Apple/Google Sign-In, device installations, subscriptions, and dealer entitlements.

**Monetization defaults to OFF.** Do not enable in production until Owner completes store + IAP setup.

## Feature flags

| Flag | Env override | ProductPolicy key | Default |
|------|--------------|-------------------|---------|
| Monetization | `MONETIZATION_ENABLED` | `MONETIZATION_ENABLED` | `false` |
| Trial (21 days) | `TRIAL_ENABLED` | `TRIAL_ENABLED` | `false` |
| Native push | `NATIVE_PUSH_ENABLED` | `NATIVE_PUSH_ENABLED` | `false` |

Env wins over DB. When monetization is OFF, `assertEntitled` / `requireEntitledDealer` always allow.

## Identity providers (OWNER_REQUIRED)

### Apple Sign In

```
APPLE_CLIENT_ID=          # Services ID / bundle id audience
APPLE_TEAM_ID=            # OWNER_REQUIRED
APPLE_KEY_ID=             # OWNER_REQUIRED
APPLE_PRIVATE_KEY=        # OWNER_REQUIRED — PEM contents (\n escaped)
```

### Google Sign In

```
GOOGLE_CLIENT_ID=              # Web / primary audience
GOOGLE_ANDROID_CLIENT_ID=      # OWNER_REQUIRED for Android
GOOGLE_WEB_CLIENT_ID=          # optional alias
```

### Test / local fake mode

```
IDENTITY_PROVIDER_MODE=fake
```

Fake tokens:

- Apple: `fake.apple.<base64url({sub,email})>`
- Google: `fake.google.<base64url({sub,email,name})>`

Auth flow:

1. `POST /api/auth/apple` or `/api/auth/google` → `{ bridgeToken, userId, needsDealerProfile }`
2. Client: `signIn('credentials', { bridgeToken })`
3. Link while logged in: `POST /api/auth/link/apple|google`

**Takeover rule:** email alone never links or takes over an account. Provider subject must match or user must be authenticated to link.

## Billing (OWNER_REQUIRED)

```
BILLING_PROVIDER_MODE=fake   # tests / local only — never Production
APPLE_IAP_ISSUER_ID=         # App Store Connect API key issuer
APPLE_IAP_KEY_ID=
APPLE_IAP_PRIVATE_KEY=
APPLE_IAP_BUNDLE_ID=co.rematcher.exchange
APPLE_IAP_SHARED_SECRET=     # optional legacy; ASN v2 uses signedPayload JWS
GOOGLE_PLAY_PACKAGE_NAME=co.rematcher.exchange
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=   # full SA JSON string
GOOGLE_PLAY_WEBHOOK_SECRET=         # HMAC for Pub/Sub push envelope (custom)
```

JSON purchase proofs are **rejected** unless `BILLING_PROVIDER_MODE=fake`.

Native:

- iOS `StoreBillingPlugin` — StoreKit 2 (`Product.purchase` / `Transaction.currentEntitlements`)
- iOS `SocialLoginPlugin` — Sign in with Apple (`ASAuthorizationAppleIDProvider`)
- Android `StoreBillingPlugin` — Play Billing Library 7 (`BillingClient` subscriptions)
- Android `SocialLoginPlugin` — Google Sign-In (`requestIdToken`); set Capacitor config `googleServerClientId` or `default_web_client_id` string

Live Sandbox / Internal testing still requires Owner store products + device (OWNER_BLOCKED until verified).

Paywall UI: `/subscription` + `GET /api/billing/paywall`.


Endpoints:

- `POST /api/billing/apple/verify`
- `POST /api/billing/google/verify`
- `POST /api/billing/restore`
- `POST /api/billing/webhooks/apple|google`
- `GET /api/billing/paywall` — catalog + entitlement; `localizedPrice` always `null` (store owns price)

## Devices

- `POST|PATCH /api/devices/register`
- `POST /api/devices/revoke` (logout)

## Other APIs

- `GET|PUT /api/notifications/event-preferences`
- `POST /api/app/version-check`

## Entitlement statuses

`FREE` | `FOUNDING_DEALER` | `TRIAL` | `ACTIVE` | `GRACE_PERIOD` | `EXPIRED` | `SUSPENDED`

Trial length: **21 days**. Trial start is **not** `accountCreatedAt`.

Backfill missing rows:

```bash
npx tsx scripts/backfill-dealer-entitlements.ts
```

## Agent

When monetization is ON, Agent 4.1 system context includes compact `accessStatus` / `trialDaysRemaining`. Tool `get_my_entitlement` returns service truth only.

## Deep links

`/subscription` is in `SAFE_DEEP_LINK_PREFIXES`.
