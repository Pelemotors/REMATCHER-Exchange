# 01 — Current Architecture

**SHA:** `6e1eda818b0daf567785953aa656711569f62179`  
**Package name:** `dealer-bid` 0.1.0  
**Canonical URL:** `https://exchange.rematcher.co.il`

## 1. Stack בפועל

| שכבה | מה יש היום |
|------|-------------|
| UI | Next.js 15.5.24 App Router, React 19, Tailwind 3.4, Heebo/RTL |
| API | Route Handlers ב-`src/app/api` (~103 routes). **אין Server Actions** |
| ORM / DB | Prisma 6 + PostgreSQL. **אין Supabase SDK, אין RLS ב-schema** |
| Auth | NextAuth v5 (Auth.js) JWT. שני מופעים: dealer + admin |
| AI | OpenAI SDK. Agent 4.1 + parsers/OCR נפרדים |
| Email | Resend |
| Push | `web-push` (VAPID). Native tokens נשמרים; delivery חסום עד APNs/FCM |
| Media | Filesystem מקומי (`MEDIA_ROOT`) + Sharp → WebP. אין S3 |
| Native shell | Capacitor 8, `appId: co.rematcher.exchange`, **remote URL** לא bundle סטטי |
| Deploy | systemd `rematcher-exchange-production` על `:3200`, Caddy TLS. Vercel נשאר כשריד (cron/health fallbacks) |

`@auth/prisma-adapter` נמצא ב-`package.json` **ולא מחובר**. Session היא JWT, לא שורות `Session` ב-DB ל-dealer.

## 2. Dependency map

```
Browser / PWA / Capacitor WebView
        │  cookies (NextAuth) + fetch /api/*
        ▼
Next.js 15 (App Router)
  ├── Server Components (pages/layouts) → Prisma/services ישירות
  ├── Client islands ("use client") → REST
  └── Middleware: catalog host rewrite בלבד (לא auth)
        │
        ├── Prisma → PostgreSQL (Docker :5436 ב-self-host; .env.example עדיין מציין "via Supabase" כהוסט אפשרי)
        ├── MEDIA_ROOT filesystem
        ├── OpenAI
        ├── Resend
        ├── web-push / VAPID
        └── data.gov.il (GOV plate lookup)
```

צדדים שלישיים נוספים (אופציונליים לפי flags): Apple/Google OAuth, Apple IAP, Google Play Billing.

**לא קיים:** Redis, WebSocket/SSE, Stripe, Firebase SDK, Supabase Auth/Storage/Realtime.

## 3. Next.js boundaries

- כ-~70 קבצים `"use client"`.
- כ-~100 מודולים `"server-only"` תחת `src/services/`.
- Layout סוחר: `src/app/(dealer)/layout.tsx` — gates סשן/אימות/privacy-ai/entitlement.
- Layout אדמין: `src/app/admin/layout.tsx` — cookie נפרד.
- קטלוג ציבורי: `/c/[slug]` + rewrite מ-host.

## 4. Middleware

`src/middleware.ts`:

1. מעביר `x-pathname` / `x-search`.
2. אם ה-host הוא slug של קטלוג — rewrite ל-`/c/{slug}`.
3. כופה `http:` אחרי TLS termination של Caddy.

**אין** בדיקת session ב-middleware.

## 5. Database

`prisma/schema.prisma` — PostgreSQL, ~70 models, 23 migrations ב-Production health.

קבוצות עיקריות: User/Dealer/Membership, Vehicle/Media/Intake, Demand/SearchIntent, CandidateMatch/Interest/Reveal, Notifications/Push, Privacy/Deletion, Billing/Entitlement, AiOperationLog/AppEvent.

חיבור: `DATABASE_URL` (pool) + `DIRECT_URL`. DDL: `MIGRATION_DATABASE_URL`.

**RLS:** לא מוגדר ב-Prisma. ההרשאה היא application-level (`dealerId` ב-session + `where`).

הערה על "Supabase": `.env.example` כותרת "PostgreSQL via Supabase". ב-self-host הנוכחי זה Docker Postgres. אין שימוש ב-Supabase Auth/RLS/Storage. אין צורך להחליף את Postgres; אין תלות מוצר ב-Supabase client.

## 6. Storage

- כתיבה: `src/lib/media/storage.ts`
- עיבוד: `src/lib/media/process.ts` (Sharp, max 12MB, WebP)
- הגשה: `GET /api/media/[...key]` — מאומת + בעלות או match גלוי לקונה
- Production path מתועד: `/srv/gal/rematcher-exchange/media`

## 7. Background jobs

`GET/POST /api/cron/lifecycle` — תפוגת demands, reminders, pilot reconcile.

Auth: header `x-vercel-cron`, או `CRON_SECRET`, או session ADMIN.

ב-self-host אין systemd timer בתוך הריפו — צריך קורא חיצוני. זה שריד Vercel.

## 8. PWA

- `public/manifest.json` — standalone, RTL, `start_url: /home`
- `public/sw.js` — cache מינימלי (`/offline`) + push
- `next.config.ts` — `Service-Worker-Allowed: /`, Universal Links / assetlinks headers

## 9. Capacitor שכבר קיים (עדות, לא החלטה)

`mobile/capacitor.config.js`:

- טוען `MOBILE_WEB_URL` (ברירת מחדל Field Test)
- `webDir: www` הוא stub; האפליקציה היא **WebView על האתר**
- Android project אמיתי תחת `android/`
- iOS sources תחת `mobile/ios/` בלי `.xcodeproj` על ה-Linux host
- Plugins מותאמים: SocialLogin, ShareStaging, StoreBilling, Clipboard

זה **לא** אפליקציה native עם מסכים מקוריים. זה אתר בתוך WebView.

## 10. Deploy

`scripts/deploy-exchange-production.sh`: tsc → `npm test` → `prisma migrate deploy` → `next build` → systemd restart → smoke health/login.

יחידה: `deploy/rematcher-exchange-production.service`, bind `127.0.0.1:3200`.

Health חושף: `commit`, `agentVersion: "4.1"`, `matchingEngine: "2.0"`, `migrationsApplied`, kill switches.

## 11. Vercel leftovers

- `vercel.json` — cron יומי
- `VERCEL_GIT_COMMIT_SHA` ב-health
- `migrate-if-production.js` רץ כש-`VERCEL_ENV=production`
- `x-vercel-cron` ב-lifecycle

Production האמיתי היום הוא VPS, לא Vercel.

## 12. משתני סביבה (שמות בלבד)

ראה `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `OPENAI_*`, `VAPID_*`, `RESEND_*`, `MEDIA_*`, `APPLE_*`, `GOOGLE_*`, `MONETIZATION_ENABLED`, `NATIVE_PUSH_ENABLED`, `CRON_SECRET` (בקוד, לא ב-example).

`NEXT_PUBLIC_*` היחידים המהותיים: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_NATIVE_PUSH_READY`.
