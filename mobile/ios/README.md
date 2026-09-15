# iOS containing app + Share Extension — source of truth in repo

## Code readiness (this repo)

| Piece | Status |
|-------|--------|
| Share Extension (`ShareViewController.swift`) | **Real implementation** — images (incl. HEIC) + text, App Group staging, pending.json, URL open |
| Activation rules (`Info.plist`) | Images max **40** + **Text** — appears for Photos / WhatsApp image+text shares |
| App Group | `group.co.rematcher.exchange` on App + Extension entitlements |
| Capacitor `ShareStaging` plugin (iOS) | `ShareStaging/ShareStagingPlugin.swift` — create → add_text → media → ack |
| Deep link | `rematcher-exchange://intake?clientBatchId=&source=IOS_SHARE&staged=1` → web `/intake/handoff` |
| Web handoff | `IntakeHandoffClient` consumes `ShareStaging` for `IOS_SHARE` / `ANDROID_SHARE` |

**There is no `.xcodeproj` / Capacitor `ios/` tree on this Linux host.** Sources are complete; Xcode target membership + signing happen on a Mac.

## Bundle IDs

| Target | Bundle ID |
|--------|-----------|
| Containing app | `co.rematcher.exchange` |
| Share Extension | `co.rematcher.exchange.ShareExtension` |
| App Group | `group.co.rematcher.exchange` |
| URL scheme | `rematcher-exchange` |

## Mac wiring (once)

```bash
npm i @capacitor/ios
MOBILE_WEB_URL=https://field-test-exchange.rematcher.co.il npx cap add ios
bash mobile/ios/apply-share-sources.sh
# Then Xcode steps printed by the script + docs/IOS_TESTFLIGHT_OWNER_ACTIONS.md
```

## Owner / Apple (cannot do on this VPS)

1. Apple Developer Program  
2. App IDs + App Groups capability on both IDs  
3. Provisioning profiles + signing Team  
4. Xcode build / TestFlight upload  
5. Physical iPhone: install → login once → Photos/WhatsApp → Share → REMATCHER Exchange  

## Final acceptance test (device only — not PASS until run)

```
Photos or WhatsApp → Share → REMATCHER Exchange → images/text staged → app opens handoff → Intake ACK (“קיבלנו”)
```
