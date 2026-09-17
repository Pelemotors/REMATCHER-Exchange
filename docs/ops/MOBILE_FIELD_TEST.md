# Mobile sandbox — Field Test

Mobile clients **must not** use Production (`https://exchange.rematcher.co.il`) as a development or preview backend.

| | Field Test | Production |
|---|---|---|
| Host | `https://field-test-exchange.rematcher.co.il` | `https://exchange.rematcher.co.il` |
| App | `:3100` | `:3200` |
| Postgres | Docker `:5435` | Docker `:5436` |
| Media | `/srv/gal/rematcher-exchange/field-test/media` | `/srv/gal/rematcher-exchange/media` |

`/api/v1` is additive. Mobile Auth is opaque access (~15m) + rotatable refresh (~30d). Clients talk only to Field Test during Milestone 1. Production is not the sandbox.

Build isolation: Field Test must set `NEXT_DIST_DIR=.next-field-test` so `next start` does not share Production `.next` chunks.

Cron: self-host must use `Authorization: Bearer $CRON_SECRET`. A bare `x-vercel-cron` header is ignored unless `VERCEL_ENV` is set by the Vercel platform.

Stale docs that describe Production as Supabase/Vercel are not operational truth. See Phase 3B provenance.
