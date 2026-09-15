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

## Public reachability — status

**Caddy (done on VPS):** host `field-test-exchange.rematcher.co.il` → `127.0.0.1:3100`  
Backup: `/etc/caddy/Caddyfile.bak-field-test-*`  
Existing hosts verified after reload.

**DNS (OWNER ACTION REQUIRED):** zone is LiveDNS (`park1/park2.livedns.co.il`).  
Current lookup: **NXDOMAIN** for `field-test-exchange.rematcher.co.il`.  
No LiveDNS/API credentials are available on this server — engineering cannot create the record.

### Exact DNS steps (you)

1. Log into the DNS panel for `rematcher.co.il` (LiveDNS / DomainTheNet — typically https://domains.livedns.co.il/ or the registrar panel that manages this domain).
2. Create record:
   - **Type:** `A`
   - **Name/Host:** `field-test-exchange` (FQDN = `field-test-exchange.rematcher.co.il`)
   - **Value:** `65.21.200.14`
   - **TTL:** 300–3600 (default OK)
3. Optional: do **not** create AAAA unless you also have a stable IPv6 you want Let’s Encrypt to use.
4. Wait until public resolve works:
   ```bash
   dig @8.8.8.8 +short A field-test-exchange.rematcher.co.il
   # expect: 65.21.200.14
   ```
5. Tell engineering “DNS live” — Caddy will obtain Let’s Encrypt cert automatically (already configured; retries on its own). Then we restart Field Test with HTTPS URLs and run external smoke.

`.env.field-test` URLs are already prepared for `https://field-test-exchange.rematcher.co.il` (still points at Field Test DB/media only).

## OPENAI

Set `OPENAI_API_KEY` in `.env.field-test` when AI parse/classify paths are exercised. Identity/GOV works without it.
