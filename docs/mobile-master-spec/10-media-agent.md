# 10 — Media & Agent

## Media (V1: keep VPS disk)

Phase 3B verified: `MEDIA_ROOT=/srv/gal/rematcher-exchange/media`, Sharp WebP, MIME jpeg/png/webp, 12MB, keys under `vehicles/{dealerId}/{vehicleId}/` or `intake/…`, `GET /api/media` with session + owner **or** buyer-visible match.

**KEEP CURRENT FOR V1. MIGRATE LATER** to object storage. Do not block Mobile on S3.

### Mobile V1 contract

| Step | Rule |
|---|---|
| Upload | multipart to `/api/v1/intake/batches/{id}/media` or inventory media |
| Auth | Bearer on upload and download |
| Ownership | server; client never picks another dealerId path |
| MIME/size | server rejects; client pre-checks 12MB and type |
| Progress | upload task progress UI on Capture |
| Retry | unknown outcome → new media object + Idempotency-Key; do not double-commit intent |
| Download | `GET /api/v1/media/{key}` with Bearer; cache thumbs privately |
| Future object storage | same keys in DB; swap GET to signed URL **inside** the same path |

Web cookie GET `/api/media` remains. v1 adds Bearer. Dual-auth on one handler is ADAPT, not a second store.

License-plate images follow the same ownership as intake (owner-only until committed to VehicleMedia).

---

## Agent Mobile contract

```
Mobile → POST /api/v1/agent/turns → runExchangeAssistantV2
       → privacy gate → agent-loop → Action Gateway → services → Prisma
```

**No OpenAI key on device. No Mobile → OpenAI.**

| Topic | V1 spec |
|---|---|
| Thread list | **not a ChatGPT history product**. One operational conversation per dealer (as `DealerMemoryItem` state today) |
| GET conversation | server state only |
| POST turn | `{ message, context: { route, entityType, entityId } }` — **no client conversation blob** |
| Streaming | **not required** (server has none; 45s JSON). Native shows processing + Exchange Mark `searching` |
| Actions | return `pendingConfirmation` like Web; UI confirms; second turn or dedicated confirm flag |
| Errors | `AGENT_TIMEOUT`, `AGENT_UNAVAILABLE`, fishing/inference as `PERMISSION_FORBIDDEN` with stable subcode if added |
| Retry | GET is safe; POST writes need Idempotency-Key; user-initiated retry only |
| Rate limit | add server limit in B10 (none dedicated today) |
| Images | **not** via agent loop. Photos go through Capture/intake APIs (vision/OCR server-side) |
| Reconnect | if killed during turn, GET conversation; do not assume the write finished without confirmation payload |
| Data to OpenAI | conversation text, authorized read-tool summaries, intake images/plates on **intake** path — see Phase 3B. Consent via Privacy AI gate |

Action Gateway stays the only write path. Mobile never “executes” a tool locally.
