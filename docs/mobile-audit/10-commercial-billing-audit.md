# 10 — Commercial / Billing Audit

**אין יישום תשלום בביקורת הזו.** Billing במוצר כבוי כברירת מחדל.

## Flags

`src/config/product-policy.ts`:

- `MONETIZATION_ENABLED` default **false**
- `TRIAL_ENABLED`
- `BILLING_PROVIDER_MODE` = `fake` | apple/google
- `IDENTITY_PROVIDER_MODE`

כש-OFF: `requireEntitledDealer` לא חוסם. Layout לא מפנה ל-`/subscription`.

## Plans (קוד + DB)

`src/config/commercial.ts` + מודלים `SubscriptionPlan`, `ProviderProduct`:

| slug | Reveals/חודש | מחיר ₪ |
|------|----------------|--------|
| onboarding | 0 (+5 lifetime) | 0 |
| dealer | 15 | 2,990 |
| dealer_pro | 30 | 5,490 |
| dealer_max | 60 | 8,990 |

יחידת החיוב: **`reveal_created`**, לא match ולא interest.  
Grace: mutual interest עדיין יוצר reveal; נחסמות connections חדשות — `docs/COMMERCIAL_MODEL.md`, P-61.

Trial: 21 יום (`TRIAL_DURATION_DAYS`).  
סטטוסים entitled: ACTIVE, TRIAL, FOUNDING_DEALER, GRACE_PERIOD.

## משטחי מוצר

- `/subscription` + `GET /api/billing/paywall`
- `GET /api/commercial/usage`
- Native: `paywall-client.tsx` + `StoreBilling` Capacitor plugin
- Verify: `POST /api/billing/apple/verify`, `/google/verify`, `/restore`
- Webhooks: `/api/billing/webhooks/apple|google`
- Reconcile: `src/services/billing/reconcile.ts` → `DealerSubscription` + `DealerEntitlement`

## Feature gating במקומות בקוד

- `(dealer)/layout.tsx` → `/subscription`
- `requireEntitledDealer()` → 402
- Action Gateway בודק entitlement
- `canDealerReveal()` ב-`reveal-usage.ts`

## Placeholders / הנחות

- `BILLING_PROVIDER_MODE=fake` לטסטים
- StoreBilling plugin קיים ב-Android/iOS sources לפני שהמונטיזציה דלוקה
- Bundle id: `co.rematcher.exchange` (גם IAP example ב-`.env.example`)

## למובייל

חנויות **דורשות** IAP למוצרים דיגיטליים בתוך האפליקציה אם ייפתח paywall.  
הקוד כבר מכוון ל-Apple/Google ולא ל-Stripe ב-app.  
כל עוד `MONETIZATION_ENABLED=false`, אין חסימת Store — אבל ה-questionnaire יישאל על תשלומים/מנויים. צריך תשובה עקבית: "לא פעיל / מתוכנן IAP".
