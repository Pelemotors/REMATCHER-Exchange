# Mobile backends

## Milestone 1 (locked)

Canonical API: **`https://exchange.rematcher.co.il`** (Production `:3200`, Postgres `:5436`).

Debug iOS `API_BASE_URL` must be this host. Do not require `field-test-exchange.rematcher.co.il` for Milestone 1.

Production is the real product backend. It is not a destructive test sandbox:

- Automated tests run isolated (Vitest mocks / memory rate-limit). They must not login, seed, or mutate Production.
- No `db:seed`, reset, or integration suites against `:5436`.
- Ship `/api/v1` + `MobileSession` only after: security tests, Web `npm test`, backup, rollback SQL review.

## Optional isolated stack (not M1)

A separate Field Test process may still exist on `:3100` / `:5435` for later engineering. It is **not** the Milestone 1 iPhone target.

| | Production (M1) | Isolated FT (optional) |
|---|---|---|
| Host | `https://exchange.rematcher.co.il` | `https://field-test-exchange.rematcher.co.il` |
| App | `:3200` | `:3100` |
| Postgres | Docker `:5436` | Docker `:5435` |

Build isolation: Field Test may set `NEXT_DIST_DIR=.next-field-test` so it does not share Production `.next` chunks.

Cron: self-host must use `Authorization: Bearer $CRON_SECRET`. A bare `x-vercel-cron` header is ignored unless `VERCEL_ENV` is set by the Vercel platform.
