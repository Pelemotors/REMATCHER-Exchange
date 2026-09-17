# 09 — Push & Deep Links

## Push architecture (target)

```
Domain event (matching-flow, freshness, lifecycle, agent)
    → notifyDealerUsers / createNotification   [KEEP]
    → prefs + NotificationEventPreference
    → privacy (no seller identity in buyer copy)
    → DeviceInstallation where userId in memberships, revokedAt null, pushToken present
    → APNs (ios) / FCM (android) / skip web tokens on mobile sender
    → device
    → deep link path (allowlisted)
```

Web Push VAPID remains for the website. Mobile does not use VAPID.

---

## Device registry (conceptual — no migration in this phase)

Reuse and **harden** `DeviceInstallation` (already: installationId unique, userId, dealerId, platform, appVersion, buildNumber, pushToken, pushProvider, pushPermission, lastSeenAt, createdAt, revokedAt).

Add in B12/B13 (planned, not executed):

- `enabled` (or treat revokedAt + null token as disabled)
- `tokenInvalidatedAt` / last provider error
- uniqueness on `(pushProvider, pushToken)` where token not null
- **ownership on revoke** (P0)

Multi-device: one row per `installationId`. User may have many.

---

## Notification event catalog

Names come from existing enums (`NotificationType`, `PushTriggerType`, `NotificationEventType`, `PRODUCT_EVENTS`). Do not invent STORE_MARKETING events.

| Domain event | Source | Recipient | Privacy | Copy | Destination | Urgency | Dedup | Web Push today | Mobile |
|---|---|---|---|---|---|---|---|---|---|
| `BUYER_MATCH` / `MATCH_CREATED` | matching-flow | demand owner users | no seller id / price | server Hebrew | `/matches?focus=` | high | existing per entityId | yes if subscribed | **required** |
| `SELLER_OPPORTUNITY` | matching-flow | vehicle owner | no buyer identity | server | `/opportunities?focus=` | high | per opportunity | yes | **required** |
| `MUTUAL_INTEREST` | matching-flow | both dealers | still no extra PII until reveal payload | server | `/reveals/{id}` or matches | high | per mutual | yes | **required** |
| `REVEAL` / `REVEAL_CREATED` | reveal-flow | both | contacts only in-app after open | server | `/reveals/{id}` | high | per reveal | yes | **required** |
| `VALIDATION_REQUEST` | freshness/validation | vehicle owner | own vehicle | server | `/validations?focus=` | high | per vehicle/day | yes | **required** |
| `FRESHNESS` | `notifyFreshnessAttention` | owner | own | server | `/inventory?focus=` | medium | per vehicle/day | yes | **required** |
| `DEMAND_EXPIRY` / `SEARCH_EXPIRING` | product-events / lifecycle | demand owner | own search title | server | `/demand?edit=` | medium | per demand/day | yes | **required** |
| `OUTCOME_REMINDER` | `OUTCOME_PENDING` | reveal parties | no extra | server | `/reveals/{id}` | low | 7d | yes | P2 |
| `INVENTORY_ENRICHMENT` | enrichment | owner | own | server | `/inventory?enrich=1` | medium | | yes | P2 |
| `INTAKE_NEEDS_INFO` | event pref type | owner | own batch | server | `/intake/handoff` | medium | | pref exists | **required** if capture async |
| `AGENT_ATTENTION` | event pref | owner | no network fishing | server | Agent sheet + context | medium | | pref exists | P2 |
| `DEALER_VERIFICATION` | admin approve | dealer users | | server | `/home` | high | | yes | **required** |
| `SYSTEM` / `ADMIN_MANUAL` | admin comms | audience | | campaign | allowlisted link | varies | campaign | yes | P2; never raw URLs |

Buyer match copy must not include counterparty names. Same privacy-views as API.

---

## Deep link contract

Reuse paths from `src/lib/deep-links.ts`.

| Entity | Path |
|---|---|
| Home | `/home` |
| Inventory vehicle | `/inventory?focus={id}` (+ `enrich=1`) |
| Demand | `/demand?edit={id}` |
| Match | `/matches?focus={id}` |
| Opportunity | `/opportunities?focus={id}` |
| Validation | `/validations?focus={id}` |
| Reveal | `/reveals/{id}` |
| Activity | `/activity` |
| Capture | `/intake` or `/intake/handoff` |
| Agent | `/home?agent=1&entityType=&entityId=` (new query; must be allowlisted) |
| Account | `/account` |

Hosts:

| Env | Associated domain |
|---|---|
| Production | `exchange.rematcher.co.il` |
| Field Test | `field-test-exchange.rematcher.co.il` |
| Dev | none or local — **no Production host in Dev entitlements** |

AASA / assetlinks today contain **placeholder TEAMID / SHA256**. Gate 4 requires real values. Capacitor entitlements are not the new app’s file — they are evidence of intended hosts.

### Behaviors

| Situation | Behavior |
|---|---|
| Logged in, entity ok | navigate after privacy GET |
| Logged out | login with `callback` = sanitized path |
| Access expired | refresh then navigate |
| Wrong dealer / 403 | Home + `RESOURCE_NOT_FOUND` / forbidden banner (no leak) |
| Deleted entity | same as stale Web matches banner |
| App not installed | Universal Link / App Link → HTTPS Web fallback (existing site) |
| `/admin` | do not open in app; Safari / ignore |

**Authorization runs after the app opens**, via v1 GET of the entity. The URL is not a capability token.

Custom scheme (`rematcher://`) is optional fallback; **Universal Links / App Links are primary**.
