# Production Backup — Reality Check

**Project:** REMATCHER Exchange (Supabase `qammtrqpnapmeerskhns`, region `eu-central-1`)  
**Verified:** 2026-09-05 via project status API (`ACTIVE_HEALTHY`)

## What exists

| Capability | Status | Notes |
|------------|--------|-------|
| Managed Postgres | Yes | Supabase hosted |
| Daily automatic backups | **Plan-dependent** | Supabase Pro typically includes daily backups; Free/legacy may differ. **Confirm in Supabase Dashboard → Project Settings → Database → Backups** |
| Point-in-Time Recovery (PITR) | **Not verified as enabled** | Requires paid add-on on many plans. Dashboard is authoritative. Do not assume PITR. |
| Application-level backup export | Not implemented | No custom dump cron in this repo |
| Object storage backups | N/A for core marketplace rows | Business truth is in Postgres |

## What is NOT protected by this repo alone

* Accidental destructive SQL against Production
* Lost secrets (Vercel/Supabase env) — recover from password managers / Vercel env history
* Local developer databases

## Who can initiate restore

* Supabase project Owner/Admin via Dashboard restore UI (or support)
* Application redeploy cannot by itself restore lost rows

## Operator action required

1. Open Supabase Dashboard for **REMATCHER Exchange**
2. Record: backup schedule, retention days, PITR on/off
3. Store the result in the private ops vault (not in git with secrets)
4. If PITR is off and Pilot data must be durable — upgrade/enable per Supabase pricing (manual purchase; not automated by this codebase)
