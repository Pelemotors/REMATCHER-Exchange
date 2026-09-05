# Application & Migration Rollback

## Application regression

1. Identify last known-good SHA from Production health (`fullCommit`) or git tags
2. Redeploy that SHA on Vercel (promote previous deployment / revert merge)
3. Verify `https://exchange.rematcher.co.il/api/health` shows the previous commit
4. Run controlled TEST smoke (login + one Match/Opportunity deep link)

**Application rollback does not undo database migrations already applied.**

## Database migrations

* Prefer expand → deploy compatible code → migrate/backfill → verify → contract later
* Do **not** assume every migration is automatically reversible
* Never automate destructive rollback that drops marketplace history

### Irreversible migrations

* Require a forward-fix plan (add columns/tables, dual-write, then remove later)
* Preserve IDs and business history
* Document limitations in the PR that introduces destructive SQL

### Preflight before Production migrate

```bash
npx tsx scripts/migration-preflight.ts
```

Abort if destructive patterns are unexpected or `migrate status` reports failed migrations.

## Kill switches (subsystem)

Environment flags (Vercel):

| Env | Effect |
|-----|--------|
| `KILL_PUSH=true` | Skip Web Push delivery |
| `KILL_MATCHING_NEW=true` | Reserved for gating new match creation (check code before relying) |
| `KILL_INTEREST_NEW=true` | Reserved |
| `KILL_REVEAL=true` | Reserved |

Push kill switch is enforced in `deliverPushToUser`. Changes via env are auditable through Vercel deploy history.
