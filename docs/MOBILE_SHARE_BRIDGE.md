# Mobile Share Bridge

See [ADR-001](./adr/ADR-001-mobile-share-architecture.md).

## Contract (Happy Path)

1. User Shares from WhatsApp → REMATCHER
2. OS Adapter persists locally
3. Adapter creates/resumes `IntakeBatch` (`clientBatchId` idempotent)
4. Uploads media/text to `/api/intake/batch`
5. `action: ack` → server durable ACK → UI “קיבלנו”
6. Background `processIntakeBatch` → Candidates → commit when confident

## Auth

Containing app login establishes session/token. Share Extension / receiver uses shared secure storage / cookie handoff. Never trust client `dealerId`.

## Project layout

```
mobile/
  capacitor.config.ts
  android/   # Share intent receiver
  ios/       # Share Extension + App Group
```

Built against Field Test `NEXT_PUBLIC_APP_URL` / API base.
