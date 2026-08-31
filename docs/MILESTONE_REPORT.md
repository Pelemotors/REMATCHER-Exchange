# REMATCHER Exchange — Cloud MVP Milestone Report

Date: 2026-08-31

## GitHub

| Item | Status |
|------|--------|
| Repository | `Pelemotors/REMATCHER-Exchange` |
| URL | https://github.com/Pelemotors/REMATCHER-Exchange.git |
| Visibility | Private (assumed — verify in org settings) |
| Branch | `main` |
| Latest commit | `eda1657` — fix: include .env.example |
| Secret audit | `.env`, `*.db` excluded; no secrets in history |

## Supabase

| Item | Status |
|------|--------|
| Project | **Manual Action Required** |
| Region | `eu-central-1` (recommended) |
| PostgreSQL | Schema + migration ready locally |
| Migration | `prisma/migrations/20260831120000_init_postgres/` |
| Bootstrap | `npm run bootstrap:admin` (not demo seed) |

## Vercel

| Item | Status |
|------|--------|
| Project | **Manual Action Required** — connect `Pelemotors/REMATCHER-Exchange` |
| Build | PASS locally (`npm run build`) |
| Preview URL | Pending deployment |
| Production URL | Pending deployment |

## Domain

| Item | Status |
|------|--------|
| Current | Vercel URL (until DNS) |
| Target | `exchange.<REMATCHER_DOMAIN>` — **Manual Action Required** |

## Environment Variables

| Variable | Configured |
|----------|------------|
| `DATABASE_URL` | Manual — Supabase pooler |
| `DIRECT_URL` | Manual — Supabase direct |
| `AUTH_SECRET` | Manual |
| `AUTH_URL` | Manual — deployment URL |
| `NEXT_PUBLIC_APP_URL` | Manual |
| `OPENAI_API_KEY` | Manual — server-side only |
| `VAPID_*` | Manual |
| `RUN_MIGRATIONS` | `true` on Production only |

## Brand

| Item | Status |
|------|--------|
| Palette | LOCKED tokens in `brand.ts` / `globals.css` |
| Token cleanup | Fixed scattered `slate-*`, `accent`, `badge-pending` |
| PWA identity | REMATCHER Exchange in manifest + layout |
| Visual QA | Checklist ready — screenshots pending deployment |

## P-61 Grace Reveal

| Item | Status |
|------|--------|
| Mutual Interest → Reveal | Always proceeds |
| Exhausted allowance | `GRACE` usage + `ACTION_REQUIRED` |
| New connections | Blocked via API (402) |
| Idempotency | `@@unique([revealId, dealerId])` |
| Docs | P-61 → WORKING DIRECTION in OPEN_DECISIONS |

## OpenAI

| Item | Status |
|------|--------|
| Server-side only | `server-only` on AI client |
| Fallback parser | Tests PASS |
| Cloud E2E | **Pending** — requires deployed env + API key |

## Push

| Item | Status |
|------|--------|
| Infrastructure | VAPID + SW + subscribe flow ready |
| 410 cleanup | Implemented |
| Cloud E2E | **Pending** — requires HTTPS deployment |

## Core Loop (Cloud)

| Step | Status |
|------|--------|
| Inventory | Code ready — cloud E2E pending |
| Demand | Code ready |
| AI Parse | Code ready |
| Candidate | Code ready |
| Validation | Code ready |
| B2B Price | Code ready |
| Buyer Match / Interest | Code ready |
| Seller Opportunity / Interest | Code ready |
| Mutual Interest | Code ready |
| Reveal | Grace Reveal implemented |
| RevealUsage | Code ready |
| Outcome | Code ready |

## Security

| Item | Status |
|------|--------|
| Auth | bcrypt, JWT, secure cookies (production) |
| Rate limit | `/api/auth/*` — 10/15min/IP |
| Authorization tests | 2 tests PASS |
| Privacy | Reveal FORBIDDEN for non-participants |

## Tests

```
23/23 PASS
- agent-gates (4)
- invariants (8)
- commercial (9) — includes Grace Reveal
- authorization (2)
```

## Manual Actions Required

1. **Create Supabase project** (REMATCHER Exchange, `eu-central-1`)
2. **Set `DATABASE_URL` + `DIRECT_URL`** in Vercel
3. **Connect Vercel** to `Pelemotors/REMATCHER-Exchange`
4. **Configure all env vars** (see `.env.example`)
5. **Generate VAPID keys**: `npx web-push generate-vapid-keys`
6. **Deploy Production** with `RUN_MIGRATIONS=true`
7. **Bootstrap admin**: `npm run bootstrap:admin` (not demo seed)
8. **Run cloud E2E** — buyer + seller sessions on deployed URL
9. **Visual QA** — capture screenshots per `docs/visual-qa/CHECKLIST.md`
10. **DNS** (optional) — `exchange.<domain>` → Vercel

## Recommendation — Next Milestone

1. Complete Vercel + Supabase deployment
2. Cloud Core Loop E2E with real dealers
3. Visual QA screenshots
4. Controlled dealer pilot
5. Admin Pilot Dashboard (after cloud stability)
