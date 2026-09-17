# 09 — Notifications Audit

## מה קיים

שלוש שכבות:

1. **In-app** — מודל `Notification`, מסך `/activity`
2. **Web Push** — VAPID + `public/sw.js` + `src/lib/push-client.ts`
3. **Native registration** — Capacitor PushNotifications → `/api/push/native-register` + `/api/devices/register`

## Web Push (עובד ב-PWA/דפדפן)

- מפתחות: `VAPID_PUBLIC_KEY` / `PRIVATE`
- Subscribe: `POST /api/push/subscribe` `{endpoint, keys}`
- SW: push event, `notificationclick`, telemetry ל-`/api/push/telemetry`
- קישורים: `isSafeInternalPath()` — רק deep links פנימיים

**Web-specific:** Notification permission, serviceWorker, PushManager. לא יעבוד ב-iOS/Android native בלי APNs/FCM.

## Native

- UI: `native-push-register.tsx`
- אחסון טוקן: `PushSubscription` עם `apns://` / `fcm://`
- `DeviceInstallation.pushProvider`: APNS | FCM | WEB_PUSH
- **שליחה:** `push.ts` מדלג על native עד credentials (`NATIVE_PUSH_ENABLED`, FCM/APNs). מתועד כ-OWNER_BLOCKED ב-`docs/NATIVE_STORE_READINESS.md`

הביקורת הזו **לא** בונה APNs/FCM.

## יצירה וטריגרים (reusable)

`src/services/notifications/product-events.ts` + matching-flow / reveal-flow:

| אירוע | סוג | יעד קליק |
|--------|-----|-----------|
| Match מוכן | BUYER_MATCH | `/matches?focus=` |
| קונה התעניין | SELLER_OPPORTUNITY | `/opportunities?focus=` |
| Mutual + Reveal | MUTUAL_INTEREST | `/reveals/{id}` |
| Validation | VALIDATION_REQUEST | `/validations?focus=` |
| Demand עומד לפוג | DEMAND_EXPIRY | `/demand?edit=` |
| מלאי לא טרי | FRESHNESS | `/inventory?focus=` |
| Outcome | OUTCOME_REMINDER | `/reveals/{id}` |

Persistence: `Notification` + `PushDelivery` עם `idempotencyKey`.  
קמפיינים אדמין: `PushCampaign`.

## Permission flow

Onboarding (`pushPromptedAt`) → `PushOnboardingPrompt` → Settings.  
העדפות אירוע: NEW_MATCH, MUTUAL_INTEREST, SEARCH_EXPIRING, SUBSCRIPTION, AGENT_ATTENTION, INTAKE_NEEDS_INFO.

## סיווג

| חלק | Reusable | Web-specific |
|-----|----------|----------------|
| החלטה מתי להודיע | כן | |
| מודל DB / idempotency | כן | |
| העדפות משתמש | כן | |
| Deep link destinations | כן, עם scheme native | |
| VAPID + SW | | כן |
| Permission UI של הדפדפן | | כן |
| APNs/FCM send | חסר — לא לבנות עכשיו | |

קליינט מובייל יכול להירשם היום; הוא פשוט לא יקבל push עד חיבור ספק native.
