# Mobile sandbox — Field Test

Mobile clients **must not** use Production (`https://exchange.rematcher.co.il`) as a development or preview backend.

| | Field Test | Production |
|---|---|---|
| Host | `https://field-test-exchange.rematcher.co.il` | `https://exchange.rematcher.co.il` |
| App | `:3100` | `:3200` |
| Postgres | Docker `:5435` | Docker `:5436` |
| Media | `/srv/gal/rematcher-exchange/field-test/media` | `/srv/gal/rematcher-exchange/media` |

`/api/v1` is additive. Until B03, `GET /api/v1/me` returns `AUTH_UNAUTHENTICATED`. Preview iOS uses **mock repositories**, not this host.

Cron: self-host must use `Authorization: Bearer $CRON_SECRET`. A bare `x-vercel-cron` header is ignored unless `VERCEL_ENV` is set by the Vercel platform.

Stale docs that describe Production as Supabase/Vercel are not operational truth. See Phase 3B provenance.
