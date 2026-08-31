# REMATCHER Exchange

> **REMATCHER Exchange** היא רשת פרטית לסוחרי רכב שמצליבה באופן אוטומטי בין המלאי לבין הביקושים, ומחברת בין שני סוחרים רק כאשר קיימת התאמה איכותית ועניין הדדי.

**Brand:** REMATCHER · **Product:** REMATCHER Exchange · **Tagline:** *המלאי שלך פוגש את הביקוש של הרשת*

## סטטוס

**Cloud MVP — Pilot Preparation**

## מסמכים

| מסמך | תפקיד |
|------|--------|
| [PRD_CORE.md](./PRD_CORE.md) | מקור האמת המוצרי |
| [AGENTS.md](./AGENTS.md) | הנחיות ל-AI agents |
| [docs/DEPLOYMENT_ARCHITECTURE.md](./docs/DEPLOYMENT_ARCHITECTURE.md) | GitHub · Supabase · Vercel |
| [docs/BRAND_SYSTEM.md](./docs/BRAND_SYSTEM.md) | REMATCHER Exchange Brand v1 |
| [docs/COMMERCIAL_MODEL.md](./docs/COMMERCIAL_MODEL.md) | Reveal-based subscription + Grace Reveal |
| [docs/OPEN_DECISIONS.md](./docs/OPEN_DECISIONS.md) | החלטות פתוחות |

## הפעלה מקומית

```bash
npm install
cp .env.example .env
# הגדר DATABASE_URL + DIRECT_URL (PostgreSQL / Supabase)
npx prisma migrate dev
SEED_DEMO=true npm run db:seed
npm run dev
```

פתח http://localhost:3000

**Demo accounts** (רק עם `SEED_DEMO=true`, סיסמה: `demo123`):
- `buyer@demo.com` — Buyer
- `seller@demo.com` — Seller
- `admin@demo.com` — Admin

## Production

1. חבר Vercel ל-`Pelemotors/REMATCHER-Exchange`
2. הגדר env vars (ראה `.env.example`)
3. Deploy — migrations רצות ב-production build
4. `npm run bootstrap:admin` — admin ראשון (לא demo seed)

## Tech Stack

Next.js 15 · TypeScript · Prisma/PostgreSQL (Supabase) · NextAuth · Tailwind · OpenAI · Web Push · Vitest

## Commercial Model

- Billing event: **Reveal created**
- **5 Reveals free** per Dealer
- **Grace Reveal (P-61):** mutual interest always reveals; new connections blocked when exhausted
- Outcome does **not** affect billing

## Tests

```bash
npm test
npm run build
```

## Git

Repository: `https://github.com/Pelemotors/REMATCHER-Exchange.git` (private)  
Branch: `main`
