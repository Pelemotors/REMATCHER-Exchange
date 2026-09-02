# REMATCHER Event Contract v1

One trustworthy measurement system for Product, Push, and Engagement events.

## Event categories

| Category | Examples | Source of truth |
|----------|----------|-----------------|
| **Business / Product** | `demand_created`, `match_created`, `mutual_interest` | Domain service that owns the state transition |
| **Communication / Push** | `push_created`, `push_sent`, `push_received` | Push delivery pipeline |
| **User Engagement** | `match_opened`, `reveal_opened`, `notification_read` | API / interaction layer |

## Canonical payload fields

| Field | Required | Notes |
|-------|----------|-------|
| `eventName` / `eventType` | Yes | Stable snake_case identifier |
| `eventVersion` | Yes | Default `1` |
| `occurredAt` | Yes | Server timestamp |
| `userId` | When user-scoped | |
| `dealerId` | When dealer-scoped | |
| `entityType` / `entityId` | When entity-linked | |
| `source` | Recommended | e.g. `matching`, `reveal`, `admin_comms` |
| `metadata` | Optional | JSON-safe, no secrets |
| `idempotencyKey` | Critical transitions | Prevents duplicate business events |

## Push lifecycle semantics

| Event | Meaning |
|-------|---------|
| `push_created` | Logical delivery record created |
| `push_send_attempted` | Server attempted provider send |
| `push_sent` | Provider accepted — **NOT** human seen |
| `push_delivery_failed` | Provider/send failed |
| `push_received` | Service Worker processed push on device |
| `push_clicked` | User tapped notification |
| `push_destination_opened` | REMATCHER destination opened after click |

## Idempotency

Critical state-transition events MUST use `idempotencyKey`:
- `{eventType}:{entityType}:{entityId}` for unique business facts
- Push deliveries: `{source}:{notificationId}:{subscriptionId}`

Repeated user interactions (e.g. `match_opened`) are NOT deduplicated globally.

## ADMIN_TEST exclusion

Campaigns with `source = ADMIN_TEST` use the same pipeline but are excluded from business communication KPIs by default.
