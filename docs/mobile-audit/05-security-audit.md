# 05 — Security Audit

הפרטיות בין סוחרים **לא** נשענת על UI בלבד: DTO (`privacy-views.ts`), `where: { dealerId }`, ו-gates ב-matching-flow/reveal-flow רצים בשרת. ה-UI יכול להסתיר שדות; ה-API אמור לא להחזיר אותם. נבדק בקוד ובטסטי privacy/matching.

## RLS

אין. Postgres חשוף ל-app role של Prisma, לא ל-anon PostgREST. אם אי-פעם יחברו Supabase Data API על אותו schema — זה יהיה רגרסיית אבטחה בלי RLS.

## Authorization

שרשרת: NextAuth JWT → `auth-guards.ts` → שירות עם `dealerId` מה-**session** (לא מה-body, ברוב ה-routes).

חריג מתועד: `POST /api/events/interaction` מעביר `dealerId` מה-client אחרי אימות user בלבד. אירוע אנליטי מוגבל ל-ALLOWLIST, אבל זה client-trust.

אדמין: cookie נפרד, 8ש, `requireAdminSession`.

## Client-trust

| מקום | סיכון |
|------|--------|
| `/api/events/interaction` | dealerId מה-body |
| `/api/assistant/chat` | conversation state מה-קליינט ממוזג עם שמור |
| Cron `x-vercel-cron` | אמון בתשתית |
| JWT 30 יום בלי revoke אפקטיבי | גניבת cookie = גישה ארוכה |

## Secrets / NEXT_PUBLIC

מפתחות OpenAI, VAPID private, AUTH_SECRET, DB, billing — server-only.  
`NEXT_PUBLIC_APP_URL` ו-`NEXT_PUBLIC_NATIVE_PUSH_READY` חשופים לקליינט — לא סודות.

אין שימוש ב-Supabase service_role.

## IDOR

רוב ה-GET/POST עם id בודקים `dealerId` של הסשן (demands, matches, reveals, customers, media).  
Media: owner **או** match buyer-visible — נכון לרשת האנונימית.

סיכונים שיוריים: interaction events; כל API חדש ששוכח `where: { dealerId }`.

## Cross-dealer

Network intelligence: אגרגטים עם סף קבוצה (ברירת מחדל 3).  
Buyer match view בלי זהות. בדיקות: `privacy-ai-v1-hard`, `catalog-public-privacy`, `buyer-visibility-enrichment`.

## Validation / rate limit

Zod ב-signup/reset ומספר APIs. לא כל route עם schema אחיד.  
Rate limit: login, signup, forgot, verify, intake. אין rate limit גלובלי לכל `/api/*`.

## Upload

Allowlist MIME, Sharp re-encode, 12MB, מקס 24 מדיה לרכב, מפתחות תחת dealerId. אין סריקת malware.

## Token/session storage

קליינט Web: לא שומר JWT ב-localStorage — cookie HttpOnly.  
Native WebView: אותו מודל.  
קליינט native "אמיתי" יצטרך מודל אחר (לא קיים).

## CORS / CSRF

אין CORS פתוח ל-API — same origin.  
NextAuth CSRF ל-admin. Dealer JWT + sameSite lax.  
Capacitor `allowNavigation` לרשימת hosts — הרחבה שגויה תהיה סיכון.

## XSS / injection

React escaping ב-UI. Prisma פרמטרים. `rawText`/`summaryHe` מוצגים כטקסט. Markdown במדיניות ציבורית — לבדוק renderer.  
אין עדות ל-`dangerouslySetInnerHTML` נרחב בלי ביקורת נקודתית לכל הקוד.

## Webhooks

Google Play: HMAC + timing-safe.  
Apple: JWS payload.  
`BILLING_PROVIDER_MODE=fake` לטסטים — אסור ב-Production.

## Logging רגיש

`AiOperationLog` בלי prompt מלא (מתועד ב-TOOL_POLICY).  
אין console של secrets בנתיבי production שנסקרו.

## המלצת אבטחה למובייל (בלי ליישם)

- לא לחשוף Prisma ללקוח.
- לא להסתמך על WebView cookie כחוזה ארוך טווח בלי revoke.
- לסגור `dealerId` ב-interaction ל-session.
- להשלים מחיקת נתונים לפני Store privacy questionnaire.
