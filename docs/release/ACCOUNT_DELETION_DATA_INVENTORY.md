# Account Deletion Data Inventory

| Entity | Classification | Notes |
|--------|----------------|-------|
| MobileSession | DELETE | revokeAllMobileSessionsForUser |
| DeviceInstallation | DELETE | by userId |
| PushSubscription | DELETE | by userId |
| ExternalIdentity | DELETE | by userId |
| NotificationPreference / EventPreference | DELETE | by userId |
| IdentityLinkChallenge | DELETE | by userId |
| DealerMemoryItem | DELETE | forgetAllMemoryForDealer |
| MarketWatch | RETAIN (inactive) | dealer row retained (FK); watches remain on disabled dealer — no PII beyond query make/model |
| ExchangeEvent (DEALER_SCOPED) | RETAIN_FOR_EXPLICIT_LEGAL_REASON | append-only operational/learning log; no phone in eventData when sanitized |
| User PII (name/email/phone/password) | ANONYMIZE | tombstone email, SUSPENDED |
| Dealer contact fields | ANONYMIZE | disabled dealer |
| Vehicle / Demand / Match / Reveal / Outcome | RETAIN_FOR_EXPLICIT_LEGAL_REASON | unresolved product/legal — do not invent |
| AccountDeletionRequest | RETAIN | audit trail |
| Commercial / ProviderTransaction | RETAIN_FOR_EXPLICIT_LEGAL_REASON | billing/legal |
| IntakeBatch media files on disk | NOT fully wiped in this pass | follow-up storage GC |
| Sign in with Apple revoke | EXTERNAL | requires Apple key |
