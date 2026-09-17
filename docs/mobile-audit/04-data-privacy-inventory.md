# 04 — Data & Privacy Inventory

הרשאות כאן הן **application-level** (Prisma `dealerId`), לא RLS.

מקרא גישה: Owner = OWNER membership; Dealer members = חברי אותו dealerId; Admin = platform admin; Network = אחרי ANONYMOUS_NETWORK + מדיניות buyer-visible; Counterpart = רק אחרי Mutual Interest + Reveal.

## מלאי נתונים

| סוג | מקור | יעד | מטרה | Retention מתועד | קריאה | שינוי | מחיקה | צד ג' | קישור למשתמש |
|-----|------|-----|------|------------------|--------|--------|--------|-------|----------------|
| חשבון User | signup/OAuth | `User` | זהות | כל עוד החשבון חי | self, admin | self/admin | מחיקת חשבון **לא** מוחקת User | Resend (email) | כן |
| סיסמה | signup/reset | `User.passwordHash` | auth | עד החלפה | אין (hash) | self | עם המשתמש | לא | כן |
| עסק Dealer | signup/admin | `Dealer` | תפעול | עד disable | members, admin | owner/admin | disable בלבד | Resend אישור | כן |
| חברות | signup | `DealerMembership` | isolation | — | members, admin | admin | לא בזרימת מחיקה | לא | כן |
| לקוחות | UI/agent | `Customer` | CRM פרטי | 36ח היסטוריה | dealer | dealer | לא אוטומטי | לא | דרך dealer |
| מלאי Vehicle | intake/API/agent | `Vehicle` + `VehicleMedia` | מלאי/רשת | 36ח | dealer; network אנונימי אם פורסם | dealer | archive/sold, לא GDPR מלא | OpenAI normalize; GOV ב-intake | dealerId |
| מחיר B2B | dealer | `Vehicle.b2bPrice` | מסחר בין סוחרים | — | **לא** ב-buyer view | dealer | — | לא | dealer |
| ביקוש | parse/confirm | `Demand` + constraints + SearchIntent | matching | 36ח | dealer | dealer | lifecycle close | OpenAI parse | dealer + optional Customer |
| Matches | engine | `CandidateMatch` | התאמה | 36ח | קונה: DTO אנונימי; מוכר: opportunity | interest APIs | — | OpenAI explainer אופציונלי | שני dealerIds מוסתרים עד reveal |
| Interest / Mutual | UI/API | BuyerInterest, SellerInterest, MutualInterest | חיבור | 36ח | הצדדים | הצדדים | — | לא | כן אחרי mutual |
| Reveal contacts | createReveal | `Reveal.buyerContactJson/sellerContactJson` | חשיפת זהות | 36ח | שני הצדדים ל-reveal | outcome | — | לא | כן |
| הודעות סוכן | chat | `DealerMemoryItem` topic `agent_conversation_state_v1` (~12 turns) | הקשר | 24ח | dealer אם DEALER_MEMORY | agent+user | Privacy Center / deletion | OpenAI | כן |
| Prompts | קוד | לא ב-DB | התנהגות | — | מפתחים | — | — | נשלחים ל-OpenAI בזמן ריצה | לא ישירות |
| AiOperationLog | client.ts | DB | עלות/שגיאות | — | admin | אין | אין UI | metadata בלבד, לא prompt מלא | dealerId |
| קבצים/תמונות | upload | disk + `VehicleMedia`/`IntakeMedia` | זיהוי/מלאי | intake טרמינלי 30י | owner; buyer thumb אחרי match גלוי | dealer | מחיקת מדיה לרכב; disk orphan אפשרי | OpenAI OCR/vision | dealerId בנתיב |
| לוחית / GOV | OCR | `VehicleCandidate.govIdentityJson` | זהות רכב | עם המועמד | dealer | מערכת | — | data.gov.il | עקיף |
| Push tokens | SW / Capacitor | `PushSubscription`, `DeviceInstallation` | התראות | עד unsubscribe/deletion | self | self | deletion מוחק subs | web-push / (עתיד) FCM/APNs | userId |
| העדפות התראה | UI | NotificationPreference* | consent ערוץ | — | self | self | — | לא | כן |
| Analytics AppEvent | UI/API | `AppEvent` | מוצר | — | admin | — | — | לא | userId/dealerId |
| ExchangeEvent | domain | `ExchangeEvent` | למידה/אודיט | 5ש | internal/admin | — | cleanup ידני | לא | dealerId + privacyClass |
| IP | login/signup rate limit | `RateLimitEntry` key | abuse | חלון קצר | מערכת | — | — | לא | עקיף (IP+email) |
| מיילים | Resend | ספק + תוכן עסקי | טרנזקציות | אצל Resend לפי מדיניותם | נמען | — | — | **Resend** | כן |
| OpenAI payloads | runtime | OpenAI | parse/agent/OCR | מדיניות OpenAI | OpenAI | — | — | **OpenAI** | תוכן עסקי/שיחה/תמונות לוחית |
| Billing snapshots | IAP/webhooks | ProviderTransaction.raw* | מנוי | — | admin/self usage | providers | — | Apple/Google | dealerId |
| Consents | privacy-ai | PrivacyConsentDecision | חוקתיות AI | 3ש אחרי סיום | self, admin | self | — | לא | כן |
| AccountDeletionRequest | privacy UI | DB | בקשת מחיקה | — | owner, admin | owner | — | לא | כן |

## צדדים שלישיים — סיכום

| ספק | מה עובר |
|-----|---------|
| OpenAI | טקסט ביקוש, הקשר סוכן, תוצאות כלים (DTO), תמונות ל-OCR/vision |
| Resend | אימייל, שם, לינקי אימות |
| data.gov.il | מספר רכב מנורמל |
| Apple/Google Auth | idToken, email מאומת |
| Apple/Google IAP | קבלות/webhooks כש-billing דולק |
| web-push | endpoint + keys לדפדפן |
| Vercel | לא Production הנוכחי; שרידי cron/SHA |
| Supabase | לא ב-SDK. Postgres יכול להיות hosted שם היסטורית |

## Privacy / Reveal — לא UI

- `toBuyerMatchView` מסתיר dealerId, b2bPrice, score, זהות מוכר.
- רשת: רק `visibility=ANONYMOUS_NETWORK` + `mediaReady` + ACTIVE.
- `BUYER_VISIBLE_MATCH_WHERE`: VALIDATED + RESOLVED.
- Freshness UNKNOWN לא buyer-visible.
- חשיפת קשר: רק אחרי Mutual Interest → `createRevealFromMutualInterest`.

## Retention בפועל

`getRetentionPolicy()` מתועד ב-`src/services/privacy/policy.ts`.  
Cleanup ב-`retention.ts` דורש `confirm=true` — **אין cron שמוחק אוטומטית**.

## פער GDPR/מחיקה

מחיקת חשבון משביתה סוחר ומוחקת memory+push. מלאי, ביקושים, התאמות, קבצים ומשתמש נשארים. זה פער מדיניות למובייל ולחנויות.
