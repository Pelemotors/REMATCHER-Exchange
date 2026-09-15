# iOS containing app + Share Extension — Field Test wiring notes

## Targets (to be created in Xcode / Capacitor iOS)

| Target | Bundle ID | Entitlements |
|--------|-----------|--------------|
| Containing app | `co.rematcher.exchange` | `App/App.entitlements` — App Group `group.co.rematcher.exchange` |
| Share Extension | `co.rematcher.exchange.ShareExtension` | `ShareExtension/ShareExtension.entitlements` — same App Group |

## Source already in repo

- `ShareExtension/ShareViewController.swift` — images + text → App Group staging → `rematcher-exchange://intake?...`
- `ShareExtension/Info.plist` — activation: images (max 40) + text
- `App/IntakeShareHandoff.swift` — read staging / clear after durable ACK

## Still requires Apple (cannot complete on this Linux VPS)

1. Apple Developer Program
2. App IDs + App Groups capability on both IDs
3. Provisioning profiles
4. Xcode project / Capacitor `npx cap add ios` on a Mac
5. TestFlight upload

No PWA Share Target workaround — product path remains Native Share Extension.
