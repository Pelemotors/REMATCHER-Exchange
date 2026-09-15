# Mobile Share Bridge

See [ADR-001](./adr/ADR-001-mobile-share-architecture.md) and
[INVENTORY_INTAKE_ARCHITECTURE.md](./INVENTORY_INTAKE_ARCHITECTURE.md).

## Contract (Happy Path)

1. User Shares from WhatsApp → REMATCHER
2. OS Adapter persists locally
3. Adapter opens `/intake/handoff?clientBatchId=…&source=…&text=…`
4. Web (authenticated) creates/resumes `IntakeBatch`, uploads media, `add_text`, `ack`
5. Durable `acknowledgedAt` → UI “קיבלנו”
6. Background `processIntakeBatch` → Candidates → commit when confident / review when not

## Auth

Containing app login establishes session/token. Share Extension / receiver uses shared secure storage / cookie handoff. Never trust client `dealerId`.

## Project layout

```
mobile/
  capacitor.config.js
  www/                 # stub + share-bridge.js
  android/             # Share intent receiver + manifest snippet
  ios/App/ShareExtension/
```

Built against Field Test `MOBILE_WEB_URL` / `NEXT_PUBLIC_APP_URL`.
