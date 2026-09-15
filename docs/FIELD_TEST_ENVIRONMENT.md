# Field Test Environment

**Purpose:** Isolated non-Production stack for Intake + Search-First verification.  
**Not Production. Not Vercel Preview (Preview shares Production DB).**

## Isolation proof

| Resource | Field Test | Production |
|----------|------------|------------|
| Postgres | Docker `rematcher-exchange-field-test-db` on `127.0.0.1:5435`, DB `rematcher_exchange_field_test` | Supabase / Production `DATABASE_URL` |
| Media | `/srv/gal/projects/REMATCHER-Exchange/.media-field-test` | Production `MEDIA_ROOT` |
| App process | Next on port **3100** with `.env.field-test` | Vercel `exchange.rematcher.co.il` |

## Local start (engineering)

```bash
cd /srv/gal/projects/REMATCHER-Exchange
docker compose -f field-test/docker-compose.yml up -d
# ensure .env.field-test exists (gitignored)
set -a && source .env.field-test && set +a
npx prisma migrate deploy
npx tsx scripts/seed-field-test-dealers.ts
npm run build
PORT=3100 npm run start
```

## Dealers

| Dealer | Email |
|--------|-------|
| A | `fieldtest-a@rematcher.local` |
| B | `fieldtest-b@rematcher.local` |

Initial password is set by the seed script (see script; rotate before sharing externally).  
**Do not paste passwords into chat or commits.**

## Public reachability from real phones — OWNER ACTION REQUIRED

Phones cannot use `127.0.0.1`. Field Test is **not** Ready for external devices until:

1. DNS name pointing to this VPS (suggested): `field-test-exchange.rematcher.co.il` (or equivalent)
2. TLS reverse proxy (Caddy) to `127.0.0.1:3100` — **snippet only; do not edit `/srv/infra` / live Caddy without explicit owner approval**
3. Update `.env.field-test`:
   - `AUTH_URL=https://<dns>`
   - `NEXT_PUBLIC_APP_URL=https://<dns>`
   - `MEDIA_PUBLIC_BASE_URL=https://<dns>/api/media`
4. Restart the Field Test Next process

Suggested Caddy site block (owner applies):

```
field-test-exchange.rematcher.co.il {
  reverse_proxy 127.0.0.1:3100
}
```

Until then: engineering can validate APIs locally; **MOBILE FIELD TEST cannot be marked Ready for device Share** without HTTPS public URL.

## OPENAI

Set `OPENAI_API_KEY` in `.env.field-test` when AI parse/classify paths are exercised. Identity/GOV works without it.
