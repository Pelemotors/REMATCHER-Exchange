# Native Store Readiness — REMATCHER Exchange

Canonical identity (do not invent alternatives):

| Item | Value |
|------|--------|
| Capacitor / Android applicationId | `co.rematcher.exchange` |
| iOS Bundle ID | `co.rematcher.exchange` |
| iOS Share Extension | `co.rematcher.exchange.ShareExtension` |
| App Group | `group.co.rematcher.exchange` |
| URL scheme | `rematcher-exchange` |
| Field Test host | `https://field-test-exchange.rematcher.co.il` |
| Production host | `https://exchange.rematcher.co.il` |

## App Privacy / Data Safety (from code — fill store forms)

Collected for **app functionality**, linked to dealer account, **not** used for tracking/ads:

| Data | Where |
|------|--------|
| Email / account | Auth / dealer profile |
| Photos / images | Share → Intake media upload |
| Other user content (text captions, plate/commercial text) | Share text / intake |
| Product interaction | Matches, notifications preferences, Web Push subscription |
| Diagnostics (optional later) | Not wired as third-party crash SDK today |

**Not collected (no code path found):** location, contacts, advertising ID, precise tracking.

Replace `TEAMID` in `public/.well-known/apple-app-site-association` and Play SHA256 in `assetlinks.json` after Owner signing.

## Store listing checklist

- App name: REMATCHER Exchange
- Privacy policy URL: `https://exchange.rematcher.co.il/privacy` (or Field Test host until DNS cutover)
- Support: `privacy@rematcher.co.il` / terms page
- Category: Business / Productivity
- Screenshots: capture on device after TestFlight / Play internal testing
- Icon / splash: Capacitor defaults present — replace with brand assets before store submit (P1)

## Owner — Apple (tomorrow)

1. Confirm Developer Program active
2. App ID `co.rematcher.exchange` + Share Extension ID + App Group
3. Capabilities: App Groups, Associated Domains, Push (when APNs ready)
4. Replace `TEAMID` in AASA; enable Associated Domains on App ID
5. Certificates / profiles; Xcode archive → TestFlight
6. Physical: Share Photos/WhatsApp → Intake ACK

## Owner — Google Play (tomorrow)

1. Finish account verification
2. Create app `co.rematcher.exchange`
3. Upload signing / Play App Signing → put SHA256 into `assetlinks.json`
4. Add `google-services.json` when FCM desired (native push)
5. Internal testing track + AAB signed with Owner keystore
6. Physical: Gallery/WhatsApp Share → Intake ACK

## Native push (OWNER_BLOCKED for live delivery)

Code path ready:
- Client: `NativePushRegister` + `@capacitor/push-notifications`
- API: `POST /api/push/native-register` (stores `apns://` / `fcm://` tokens)
- Web Push delivery skips native endpoints

Still need Owner: APNs `.p8`, Firebase `google-services.json` / `GoogleService-Info.plist`, then wire sender.

## Android release artifacts (unsigned — no Owner keystore)

Built on Linux with SDK 36 (`assembleRelease` / `bundleRelease`):

| Artifact | Path |
|----------|------|
| Release APK (unsigned) | `android/app/build/outputs/apk/release/` |
| Release AAB (unsigned) | `android/app/build/outputs/bundle/release/` |

To produce Play-signed AAB: place Owner keystore + `.secrets/key.properties` (gitignored), then `npm run mobile:android:assemble` / `./gradlew bundleRelease`.

**Not proven without device:** Share Receiver → Intake ACK on physical Android.

## iOS (Linux cannot build)

Sources under `mobile/ios/` + `bash mobile/ios/apply-share-sources.sh` after `npx cap add ios` on **macOS/Xcode**. Simulator/device/signing = OWNER / macOS blockers.
