# Inventory Intake architecture (Field Test / Search-First)

## Happy Path

```
WhatsApp → Share → OS Adapter → durable Intake ACK → dealer done
→ processing → plate/GOV/text → VehicleCandidate(s) → auto-commit when confident
→ Vehicle + mediaReady → Matching
```

## Candidate independence

One Candidate in `NEEDS_REVIEW` / `FAILED` does not block other `READY` Candidates
in the same Batch from committing.

## GOV scope

GOV is canonical **only** for official identity fields it provides
(make/model/year/color/trim). Commercial fields (mileage, asking price, condition)
come from share text / dealer / vision with provenance — never silently overwritten by GOV.

## Media categories

`EXTERIOR` / `INTERIOR` are classified automatically when confidence ≥ 0.62.
Ambiguous media stay unset; commit **never** maps `OTHER`/null → `EXTERIOR`.
Dealer review assigns categories when needed. Readiness still requires both categories.

## State machine (Batch)

`RECEIVING` → `RECEIVED` (on media/text) → ACK sets `acknowledgedAt` (durable, idempotent)
→ `PROCESSING` → `NEEDS_REVIEW` | `READY` | `COMMITTED` | `FAILED`

## State machine (Candidate)

`IDENTIFYING` → `READY` (GOV FOUND) → auto-commit  
→ `NEEDS_INFO` (no plate / GOV miss) → dealer review  
→ `NEEDS_CONFIRMATION` (ACTIVE vehicle + **material** conflict: price/km/identity) → confirm merge or create new  
→ additive same-plate ACTIVE (no material conflict) → idempotent merge/attach (no review)  
→ SOLD/ARCHIVED same plate → create **new** ACTIVE (no auto-reactivation)  
→ `COMMITTED` | `REJECTED`

## Idempotency

- `@@unique([dealerId, clientBatchId])` resume
- ACK is durable via `acknowledgedAt`
- `COMMITTED` candidate commit is idempotent
- Process is re-entrant: existing candidates are enriched/committed, not recreated

## APIs

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/intake/batch` | create / multipart media / add_text / ack |
| GET | `/api/intake/batch?batchId=` | batch detail (dealer-scoped) |
| GET | `/api/intake/batch` | list recent batches |
| GET | `/api/intake/review` | open candidates |
| POST | `/api/intake/review` | resolve plate / categories / confirm / reject |

## Dealer UI

- `/intake/handoff` — upload + share text + ACK
- `/intake/review` — NEEDS_INFO / NEEDS_CONFIRMATION
- Inventory links to both

## Limits & retention

- Max 40 files / batch, 12MB / file, mime allow-list
- Per-dealer in-memory rate limits on create/upload/ack/resolve
- Terminal intake batches eligible for purge after `intakeMediaDaysAfterTerminal` (30d) via retention cleanup

## Observability

Exchange events: `intake.batch.acknowledged`, `intake.batch.process_*`,
`intake.candidate.gov_lookup`, `intake.candidate.needs_confirmation`,
`intake.candidate.committed_*`, `intake.candidate.review_resolved`

## Multi-vehicle

Multiple distinct plates in share text → one Candidate per plate (shared media links).
Fine-grained media clustering deferred pending Field Test telemetry.

## OCR

`plate-ocr.ts` contract exists; on-host OCR engine not bundled for Field Test.
Primary plate path: WhatsApp/share text + dealer review.
