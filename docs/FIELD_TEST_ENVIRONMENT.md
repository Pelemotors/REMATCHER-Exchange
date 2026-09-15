# Field Test Environment

**Purpose:** Isolated non-Production stack for Intake + Search-First verification.  
**Not Production. Not Vercel Preview (Preview shares Production DB).**

## Isolation proof

| Resource | Field Test | Production |
|----------|------------|------------|
| Postgres | Docker `rematcher-exchange-field-test-db` on `127.0.0.1:5435`, DB `rematcher_exchange_field_test` | Supabase / Production `DATABASE_URL` |
| Media | `/srv/gal/rematcher-exchange/field-test/media` | Production `MEDIA_ROOT` |
| App process | Next on port **3100** with `.env.field-test` | Vercel `exchange.rematcher.co.il` |
| Public host | `https://field-test-exchange.rematcher.co.il` (Caddy → `127.0.0.1:3100`) | `exchange.rematcher.co.il` |

**Env gates (Field Test):** `FIELD_TEST=true`, `DATABASE_URL`/`DIRECT_URL` → `:5435/rematcher_exchange_field_test` only, `MEDIA_ROOT=/srv/gal/rematcher-exchange/field-test/media`, no Supabase/Redis/cron secrets pointing at Production.

## Local start (engineering)

```bash
cd /srv/gal/rematcher-exchange/app
docker compose -f field-test/docker-compose.yml up -d
# Field Test ENV is stored outside the Git repository
set -a && source /srv/gal/rematcher-exchange/field-test/.env.field-test && set +a
npx prisma migrate deploy
npx tsx scripts/seed-field-test-owner-network.ts
# optional legacy seed: scripts/seed-field-test-dealers.ts
npm run build
PORT=3100 npm run start
```

## Dealers (Field Test)

| Role | Email |
|------|-------|
| Owner / Dealer A | `galsamama@gmail.com` |
| Counterparty / Dealer B | `fieldtest-b@rematcher.local` |

Owner Field-Test password is set by `scripts/seed-field-test-owner-network.ts` (override via `FIELD_TEST_OWNER_PASSWORD`).  
**Do not paste passwords into chat or commits.**

## Public reachability — PASS (as of RC)

| Check | Result |
|-------|--------|
| Authoritative `park1.livedns.co.il` A | `65.21.200.14` (AA) |
| Authoritative `park2.livedns.co.il` A | `65.21.200.14` (AA) |
| Google `8.8.8.8` | `65.21.200.14` |
| Cloudflare `1.1.1.1` | `65.21.200.14` |
| System resolver | `65.21.200.14` |
| Caddy reverse_proxy | `field-test-exchange.rematcher.co.il` → `127.0.0.1:3100` |
| TLS | Let’s Encrypt YE2, SAN = hostname, HTTP→HTTPS |

**DNS contradiction root cause (resolved):** LiveDNS authoritative answers flapped / lagged (SOA serial catch-up + negative-cache TTL up to 14400s) after an earlier successful A answer. Public resolvers reflecting NXDOMAIN/NODATA while engineering had previously seen A was **not** ordinary multi-hop propagation alone — the authoritative zone itself temporarily lacked a stable AA A. Re-check against park1/park2 showed both NS synchronized on A=`65.21.200.14` with matching SOA; public resolvers then matched. **No Owner DNS action required now.**

Historical setup notes (only if record is deleted again): create A `field-test-exchange` → `65.21.200.14` in LiveDNS.

## OPENAI

Set `OPENAI_API_KEY` in `.env.field-test` when AI parse/classify paths are exercised. Identity/GOV works without it.
