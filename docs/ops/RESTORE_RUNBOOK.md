# Production Database Restore Runbook

**Do not execute a destructive restore against Production merely to test this document.**

## Prerequisites

* Access to Supabase Dashboard (Owner/Admin)
* Access to Vercel project `rematcher-exchange`
* Knowledge of secret **names** (not values): `DATABASE_URL`, `DIRECT_URL`, `MIGRATION_DATABASE_URL`, `AUTH_SECRET`

## If Production database is corrupted or lost

1. **Identify backup**
   * Supabase → Database → Backups (or PITR timeline if enabled)
   * Choose the latest known-good point before the incident

2. **Initiate restore**
   * Use Supabase restore UI for the selected backup/PITR
   * Prefer restore-to-new-project / branch if offered, then cut over — reduces risk

3. **Point environment at restored database (if host changed)**
   * Update Vercel Production env: `DATABASE_URL`, `DIRECT_URL`, `MIGRATION_DATABASE_URL`
   * Do not commit connection strings

4. **Validate schema / migrations**
   * From a secure workstation with migration credentials:
     * `npx tsx scripts/migration-preflight.ts`
     * `npx prisma migrate status`
   * Confirm applied migrations match expected Production SHA era

5. **Application health**
   * `GET https://exchange.rematcher.co.il/api/health`
   * Expect `status: ok` (or `degraded` only if DB still failing), `db: ok`, `migrationsApplied` present
   * Login with TEST account only

6. **Resume scheduled / reactive processing**
   * Call lifecycle catch-up once (authorized):
     * `GET /api/cron/lifecycle` with `Authorization: Bearer $CRON_SECRET`
   * Or wait for Vercel Cron (daily `0 3 * * *` on Hobby; catch-up processes all overdue work)
   * For sub-daily cadence, use Pro cron or external caller with `CRON_SECRET`
   * Catch-up expires overdue Demands and runs idempotent reminders

7. **Prevent duplicate events after recovery**
   * Rely on existing unique `idempotencyKey` on AppEvent / ExchangeEvent / PushDelivery
   * Do not replay raw Push “send all” jobs without keys
   * Reconciliation is idempotent by design — re-running catch-up is safe

## Post-restore checklist

* [ ] Health `db: ok`
* [ ] Auth login works
* [ ] Matching list APIs return for TEST dealer
* [ ] Privacy gates still hide counterpart identity
* [ ] Cron catch-up completed (check health `lastLifecycleCatchup` or AppEvent)
