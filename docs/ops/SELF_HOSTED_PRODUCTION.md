# REMATCHER Exchange — Self-hosted Production (server)

Isolated from Field Test and from the original REMATCHER product.

## Layout

| Item | Value |
|------|--------|
| App | `/srv/gal/rematcher-exchange/app` |
| ENV | `/srv/gal/rematcher-exchange/app/.env.production` (never commit) |
| DB container | `rematcher-exchange-production-db` → `127.0.0.1:5436` |
| Media | `/srv/gal/rematcher-exchange/media` |
| Logs | `/srv/gal/rematcher-exchange/logs` |
| Backups | `/srv/gal/rematcher-exchange/backups` |
| systemd | `rematcher-exchange-production.service` |
| Bind | `127.0.0.1:3200` |
| Public host | `https://exchange.rematcher.co.il` (Caddy → `:3200`) |

## Isolation

| Host / port | Product |
|-------------|---------|
| `www.rematcher.co.il` → `:3002` | REMATCHER original |
| `field-test-exchange.rematcher.co.il` → `:3100` / DB `:5435` | Exchange Field Test |
| `exchange.rematcher.co.il` → `:3200` / DB `:5436` | Exchange Production |
| `mashachachti.co.il` → `:3001` | מה שכחתי |

Do not point Production at Field Test media, ENV, or DB.

## Bootstrap

Empty Production DB has no users. Create the first Admin once:

```bash
cd /srv/gal/rematcher-exchange/app
set -a && source .env.production && set +a
ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... npx tsx scripts/bootstrap-admin.ts
```

Do not run demo seed (`SEED_DEMO=false`).

## DNS cutover

Until `exchange.rematcher.co.il` A/AAAA records point at this server (not Vercel), Let's Encrypt cannot issue a cert and public HTTPS still serves Vercel. After DNS points here, Caddy will obtain the cert automatically; verify:

`curl -sS https://exchange.rematcher.co.il/api/health`

## Health

Local smoke (always available on the server):

`curl -sS http://127.0.0.1:3200/api/health`
