# 03 — Authentication & Account Lifecycle

## שני NextAuth נפרדים

| | Dealer | Admin |
|--|--------|-------|
| קובץ | `src/lib/auth.ts` | `src/lib/admin-auth.ts` |
| Cookie | `authjs.session-token` / `__Secure-authjs.session-token` | `admin-session-token` / `__Secure-admin-session-token` |
| maxAge | 30 ימים | 8 שעות |
| Providers | Credentials (סיסמה **או** `bridgeToken`) | Credentials, `role===ADMIN` |
| Adapter | אין (JWT) | אין (JWT) |

Cookies: `httpOnly`, `sameSite: lax`, `secure` ב-production. `trustHost: true`.

ADMIN בלי membership של סוחר **לא** יכול להתחבר ב-`/login`.

## Registration

`POST /api/auth/signup` (zod: email, password, confirmPassword, business fields).

יוצר User + Dealer (`PENDING`) + OWNER membership. שולח מייל אימות (Resend, טוקן 48ש). Rate limit signup. אופציונלי trial אם flags דולקים.

## Login

`signIn("credentials")` דרך `/api/auth/[...nextauth]`.  
Rate limit: 8 כשלונות/אימייל/15ד, 25/IP.  
`POST /api/auth/login-check` מבדיל 429 מהודעה גנרית.

אחרי הצלחה: `getPostAuthRedirect` (`src/lib/auth-routing.ts`).

## Logout

`signOut({ callbackUrl: "/login" })` ממסך חשבון. אין revoke של כל המכשירים ב-logout רגיל. קיים `POST /api/devices/revoke` ל-installation.

## Password reset

1. `POST /api/auth/forgot-password` — תשובה גנרית תמיד.
2. טוקן 2ש במייל.
3. `POST /api/auth/reset-password` — מעדכן hash ו-`prisma.session.deleteMany` (טבלת Session; JWT dealer לא מבוטל אוטומטית עד פקיעה).

## Email verification

`GET /api/auth/verify-email?token=` צורך טוקן, קובע `emailVerifiedAt`.  
Resend: `POST` עם email, תשובה `{ok:true}` גם למייל לא קיים.

## Social login

Apple/Google: **native plugin בלבד**. Web מציג שגיאה.

זרימה: idToken → `POST /api/auth/apple|google` → `findOrCreateFromProvider` → `bridgeToken` חד-פעמי 5 דקות → Credentials authorize.  
קישור לחשבון קיים: `POST /api/auth/link/apple|google`.

משתמשי OAuth בלי `passwordHash` לא יכולים login בסיסמה.

## Session / refresh / multi-device

- אין refresh-token endpoint.
- JWT 30 יום ב-cookie. `SessionProvider` עם `refetchOnWindowFocus: false`.
- כל מכשיר שמקבל את ה-cookie תקף עד `maxAge`.
- אין רשימת סשנים פעילים לסוחר.
- Capacitor WebView משתמש באותו cookie jar כמו האתר — כל עוד זה אותו origin.

זה **תלות Web קשה** לקליינט native שאינו WebView.

## Unauthorized / expired

- API: 401 `{ error: "Unauthorized" }`.
- Layout סוחר: redirect ל-`/login?callbackUrl=`.
- אין UX ייעודי ל-JWT שפג באמצע טופס מעבר לכשל fetch.

## Gates אחרי login

```
!emailVerifiedAt     → /verify-email
REJECTED             → /rejected
PENDING / !canAccess → /pending-approval
privacy AI לא הושלם → /privacy-ai
monetization ON && לא entitled → /subscription
אחרת                 → /home או callback בטוח
```

## Profile

`GET/PATCH /api/account/profile` — עיר/אזור וכו'. אין החלפת אימייל מתועדת כזרימה מלאה.

## Account deletion

`POST /api/privacy/account-deletion` `{action: request|confirm}` — **OWNER בלבד**.

`confirmAccountDeletion` בפועל:

1. מוחק dealer memory
2. מוחק PushSubscription של חברי הסוחר
3. `Dealer.isActive=false`, `verificationStatus=DISABLED`

**לא** מוחק: User, Vehicle, Demand, Match, Reveal, מדיה ב-disk, לוגים.  
**לא** קורא `signOut`.  
**אין** reauthentication (סיסמה/ביומטרי) לפני מחיקה.

## Reauthentication לפני פעולות רגישות

לא קיים. מחיקת חשבון, שינוי פרופיל, וקישור OAuth מסתמכים על הסשן הקיים בלבד.

## Deep-link / callback

- `callbackUrl` מסונן ב-`getPostAuthRedirect`.
- `/auth/redirect` אחרי OAuth.
- Native: `rematcher-exchange://intake?...` → `/intake/handoff`.
- Universal Links / assetlinks headers ב-`next.config.ts`.
- אימות מייל ואיפוס סיסמה הם **קישורי HTTPS בדפדפן/מייל** — תלות Web מובהקת.

## מה תלוי בדפדפן

| יכולת | תלות |
|--------|------|
| Session | HttpOnly cookie |
| CSRF admin | `__Host-admin.csrf-token` |
| OAuth Web | לא נתמך; native plugin |
| אימות מייל | לינק בדפדפן |
| PWA install | manifest + SW |
| Capacitor app | WebView + cookie לאותו host |
