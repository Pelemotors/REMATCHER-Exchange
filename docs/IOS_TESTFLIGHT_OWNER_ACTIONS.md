# iOS TestFlight — פעולות חיצוניות לבעלים (Build #6 Delta)

Engineering **לא** יכול לעקוף Apple signing / distribution / Google Console.

Canonical IDs (do not invent):

| Item | Value |
|------|--------|
| App Bundle ID | `co.rematcher.exchange` |
| Share Extension Bundle ID | `co.rematcher.exchange.share` |
| App Group | `group.co.rematcher.exchange` |
| URL scheme | `rematcher` |
| Production API | `https://exchange.rematcher.co.il` |

## Apple Developer — EXTERNAL ACTION

1. App ID `co.rematcher.exchange` — enable **Sign in with Apple**
2. App ID `co.rematcher.exchange.share` — create if missing
3. App Groups capability: `group.co.rematcher.exchange` on App + Share
4. Provisioning profiles (App + Share) for TestFlight/App Store
5. Push capability on App ID (live send also needs `.p8`)

## Google Cloud Console — EXTERNAL ACTION

1. iOS OAuth client for `co.rematcher.exchange`
2. Set public `GIDClientID` in Mobile Release config + Codemagic env
3. Add reversed client-id URL scheme to Info.plist
4. Set `GOOGLE_IOS_CLIENT_ID` (and/or `GOOGLE_CLIENT_ID`) on Backend for audience verification

## APNs — EXTERNAL ACTION

`BLOCKED — EXTERNAL ACTION: configure APNs signing key (.p8)`

Device registration / preferences / owned revoke are implemented in code.

## Code already ready (Native SwiftUI repo)

- Share Extension target + App Group staging → existing Intake
- Apple + Google social login → `/api/v1/auth/social` + explicit `/api/v1/auth/link`
- Account deletion UI under Privacy
- Do **not** trigger Codemagic from Cursor — Owner runs Build #6 manually

## Device-only (TestFlight)

WhatsApp/Photos Share Sheet appearance, Apple/Google authorize on device, visual parity — see Mobile `docs/BUILD6_DELTA_PREFLIGHT.md`.
