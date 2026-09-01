# REMATCHER Exchange — Deployment Architecture

## Overview

```
Browser / Installed PWA
          ↓
     Vercel / Next.js 15
          ↓
   Application Services
      ↙      ↓       ↘
Supabase   OpenAI   Web Push (VAPID)
Postgres
```

**Source control:** GitHub `Pelemotors/REMATCHER-Exchange` (private)  
**Hosting:** Vercel project `rematcher-exchange` (separate from REMATCHER main product)  
**Database:** Supabase PostgreSQL — region `eu-central-1` (Frankfurt)

## Environment Variables

See [`.env.example`](../.env.example). Never commit secrets.

| Variable | Scope | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Server | Supabase pooler connection (runtime, `rematcher_prisma`) |
| `DIRECT_URL` | Server | Supabase direct session connection (runtime fallback) |
| `MIGRATION_DATABASE_URL` | Production only | Dedicated migration connection with DDL authority (`postgres` role recommended) |
| `AUTH_SECRET` | Server | NextAuth JWT signing |
| `AUTH_URL` | Server | Production/preview canonical URL |
| `NEXT_PUBLIC_APP_URL` | Public | Absolute URLs / deep links |
| `OPENAI_API_KEY` | Server only | AI parsing — never `NEXT_PUBLIC_` |
| `VAPID_*` | Server (+ public key via API) | Web Push |
| `RESEND_API_KEY` | Server | Transactional email (signup/approval) |
| `EMAIL_FROM` | Server | Resend sender address |
| `REMATCHER_ADMIN_APPROVAL_EMAIL` | Server | Admin notification on new dealer |
| `SEED_DEMO` | Local only | Enable `npm run db:seed` |
| `RUN_MIGRATIONS` | Production | Run `prisma migrate deploy` on build |

## Database Migrations

**Development:** `npx prisma migrate dev` against local/direct Postgres.

**Production:** `prisma migrate deploy` runs automatically when `VERCEL_ENV=production` or `RUN_MIGRATIONS=true` (see `scripts/migrate-if-production.js`).

**Do not** use `prisma db push` in production.

### Runtime vs Migration Connections

| Purpose | Env var | Role | Notes |
|---------|---------|------|-------|
| Application runtime | `DATABASE_URL` | `rematcher_prisma` | Pooled (port 6543), minimum DML permissions |
| Direct reads/writes | `DIRECT_URL` | `rematcher_prisma` | Session mode (port 5432) |
| Schema migrations | `MIGRATION_DATABASE_URL` | `postgres` (recommended) | Production Vercel only; DDL authority |

`scripts/migrate-if-production.js` uses `MIGRATION_DATABASE_URL` → `DIRECT_URL` → `DATABASE_URL` (in that order).

**Important:** `GRANT ALL` does **not** allow `ALTER TABLE` on tables you do not own. Application tables must be owned by the migration role, or migrations must run as `postgres`.

Verify migration role before deploy:

```bash
npx tsx scripts/migration-role-proof.ts
```

### Recovery Policy

Normal path:

```
versioned migration → prisma migrate deploy → recorded in _prisma_migrations
```

Manual `_prisma_migrations` SQL updates are **recovery only** — never the default workflow. Document any manual repair in commit/deploy notes.

### Preview Safety

Preview deployments share the production DB in phase 1. Migrations **do not** run on preview builds. Seeds **never** run on Vercel.

## Local Setup

```bash
npm install
cp .env.example .env
# Set DATABASE_URL + DIRECT_URL to Supabase (or local Postgres)
npx prisma migrate dev
SEED_DEMO=true npm run db:seed
npm run dev
```

## Production Bootstrap

1. Deploy to Vercel with env vars configured
2. Migrations apply on first production build
3. Create admin (one-time):
   ```bash
   ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... npm run bootstrap:admin
   ```
4. **Do not** run demo seed in production

## Supabase Role

Supabase = **managed PostgreSQL** only. Auth remains NextAuth (Credentials + JWT). No Supabase Auth migration in this phase.

## Backup

Use Supabase project backup settings (Point-in-Time Recovery per plan). No custom backup infrastructure in MVP.

## Domain

**Production (user-facing + QA):** `https://exchange.rematcher.co.il` → Vercel CNAME.

Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the canonical domain in production.

**Vercel deployment URL** (`https://rematcher-exchange.vercel.app`) — deployment verification and debug only; not the default target for Production QA.

## Integration Principle

Vercel / Supabase / OpenAI are **infrastructure** — replaceable. WhatsApp is **not** a Core dependency.
