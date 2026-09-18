# Conversation / Agent / Intake architecture scout

Scouted: **2026-09-18**  
Roots:
- Backend: `/srv/gal/rematcher-exchange/app`
- Mobile: `/srv/gal/REMATCHER-Exchange-Mobile`

---

## 1. Prisma & persistence models

### `DealerMemoryItem`

| Item | Path / note |
|------|-------------|
| Schema | `/srv/gal/rematcher-exchange/app/prisma/schema.prisma` (lines ~235–282) |
| Enums | `DealerMemoryKind`, `DealerMemoryStatus`, `DealerMemoryProvenance` (same file) |
| Fields | `dealerId`, `topicKey`, `kind`, `status`, `summary`, `details` (Json), supersede chain, `expiresAt`, `forgottenAt` |
| Agent conversation blob | **Not a separate table.** One row per dealer with `topicKey = agent_conversation_state_v1`; `details.state` holds `ConversationState` JSON |

**Load/save:**

| File | Role |
|------|------|
| `/srv/gal/rematcher-exchange/app/src/services/assistant/conversation-persistence.ts` | `AGENT_CONVERSATION_TOPIC`, `loadAgentConversationState`, `saveAgentConversationState`, `resolveActiveConversationState` (stored wins over client) |
| `/srv/gal/rematcher-exchange/app/src/services/assistant/dealer-memory/index.ts` | Long-term dealer memory CRUD; `forgetAllMemoryForDealer` marks all ACTIVE items FORGOTTEN (includes agent state row) |
| `/srv/gal/rematcher-exchange/app/src/services/privacy/deletion.ts` | Account deletion calls `forgetAllMemoryForDealer` |

**Migrations (reference):**

- `/srv/gal/rematcher-exchange/app/prisma/migrations/20260904180000_dealer_memory/migration.sql`
- Hot-path index: `/srv/gal/rematcher-exchange/app/prisma/migrations/20260915140000_restore_hot_path_indexes/migration.sql`

### `agent_conversation_state_v1`

| Item | Path |
|------|------|
| Constant | `/srv/gal/rematcher-exchange/app/src/services/assistant/conversation-persistence.ts` → `AGENT_CONVERSATION_TOPIC = "agent_conversation_state_v1"` |
| TypeScript shape (authority for mutations) | `/srv/gal/rematcher-exchange/app/src/services/assistant/conversation-state.ts` → `ConversationState`, `PendingConfirmation`, `recentTurns` (~12), drafts, session context |
| Audit docs | `/srv/gal/rematcher-exchange/app/docs/mobile-audit/08-ai-agent-audit.md`, `/srv/gal/rematcher-exchange/app/docs/mobile-audit/04-data-privacy-inventory.md` |

There is **no** Prisma `Message` / `ConversationThread` model today.

### `IntakeBatch` and related

| Item | Path / note |
|------|-------------|
| Schema | `/srv/gal/rematcher-exchange/app/prisma/schema.prisma` → `model IntakeBatch` (~1470–1496) |
| Status enum | `IntakeBatchStatus` (RECEIVING → COMMITTED / FAILED, etc.) |
| Fields today | `id`, `dealerId`, `source`, `status`, `clientBatchId`, `receivedAt`, `acknowledgedAt`, `processingStartedAt`, `processingCompletedAt`, `failureCode`, `failureMessage`, `sourceMetadata` (Json), timestamps |
| Children | `IntakeMedia`, `IntakeText`, `VehicleCandidate` (same schema file) |
| **`conversationThreadId`** | **Does not exist** in repo (grep across `/srv/gal` — no matches). **Add here:** optional `conversationThreadId String?` on `IntakeBatch` in `prisma/schema.prisma`, plus FK when `ConversationThread` exists; migration under `prisma/migrations/` |
| Service layer | `/srv/gal/rematcher-exchange/app/src/services/intake/batch.ts` — create/resume, media, ack, list |
| Processing | `/srv/gal/rematcher-exchange/app/src/services/intake/process-batch.ts`, `classify-intake-pass.ts` |
| HTTP | `/srv/gal/rematcher-exchange/app/src/app/api/intake/batch/route.ts`, `/srv/gal/rematcher-exchange/app/src/app/api/v1/intake/batch/route.ts` |

**Intake “conversation” text (not agent chat):** WhatsApp/capture snippets merged for OCR/classification — `/srv/gal/rematcher-exchange/app/src/services/intake/conversation-text.ts`, `screenshot-demand.ts` (`ConversationExtract` type only).

---

## 2. Assistant API routes (chat, confirm, context)

Shared turn logic: `/srv/gal/rematcher-exchange/app/src/services/assistant/assistant-chat-turn.ts`  
Orchestrator: `/srv/gal/rematcher-exchange/app/src/services/assistant/v2-orchestrator.ts` → `runExchangeAssistantV2`, `getAssistantContext`

| Route | File | Methods | Notes |
|-------|------|---------|-------|
| Web chat | `/srv/gal/rematcher-exchange/app/src/app/api/assistant/chat/route.ts` | GET payload, POST turn | Session auth; POST accepts optional `conversation` (seed only if empty server state) |
| Web context | `/srv/gal/rematcher-exchange/app/src/app/api/assistant/context/route.ts` | GET | Dealer operational context for UI |
| **v1 chat (Mobile)** | `/srv/gal/rematcher-exchange/app/src/app/api/v1/assistant/chat/route.ts` | GET, POST | `requireV1VerifiedDealer`; same `runAssistantChatTurn` |
| **v1 confirm (Mobile)** | `/srv/gal/rematcher-exchange/app/src/app/api/v1/assistant/confirm/route.ts` | POST | Maps `{ confirmed: bool }` → Hebrew `"אשר"` / `"בטל"` → **same** `runAssistantChatTurn` (no separate mutation authority) |
| **v1 context** | `/srv/gal/rematcher-exchange/app/src/app/api/v1/assistant/context/route.ts` | GET | Wraps `getAssistantContext` |

**No** `/api/assistant/confirm` on Web — Web confirms via chat text (`isConfirmation` / `isRejection` in `conversation-state.ts`).

OpenAPI (Mobile): `/srv/gal/REMATCHER-Exchange-Mobile/contracts/api/v1-openapi.yaml` (`/api/v1/assistant/chat`, `/api/v1/assistant/confirm`).

Tests touching routes: `/srv/gal/rematcher-exchange/app/tests/api-v1-core-product.test.ts`.

---

## 3. Action Gateway, `pendingConfirmation`, action-truth

| File | Role |
|------|------|
| `/srv/gal/rematcher-exchange/app/src/services/assistant/action-gateway.ts` | `runActionGateway` — deterministic write boundary; sets/clears `conversation.pendingConfirmation`; inventory/search/intake mutations |
| `/srv/gal/rematcher-exchange/app/src/services/assistant/action-truth.ts` | Sanitizes assistant text that claims pending/success without state; `logPendingConfirmationInconsistency` telemetry |
| `/srv/gal/rematcher-exchange/app/src/services/assistant/action-proposal.ts` | Structured proposal types fed into gateway |
| `/srv/gal/rematcher-exchange/app/src/services/assistant/v2-orchestrator.ts` | Calls `runActionGateway`; applies `sanitizeUserFacingAssistantMessage` |
| `/srv/gal/rematcher-exchange/app/src/services/assistant/agent-loop.ts` | Tool loop; reads `pendingConfirmation` for system prompt |
| `/srv/gal/rematcher-exchange/app/tests/intake-plate-gov-action.test.ts` | Gateway + action-truth regression (INTAKE REJECT pending, confirm without pending) |

Contract doc: `/srv/gal/rematcher-exchange/app/docs/AGENT_CAPABILITY_CONTRACT.md` (ACTION TRUTH / pending confirm).

---

## 4. Mobile: Agent, Capture, Share handoff, routing

| Area | Path | Notes |
|------|------|-------|
| **AgentChatView** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Screens/AgentChatView.swift` | Local `messages` array; GET `assistantConversation()`; POST `assistantChat`; confirm via `assistantConfirm` → v1 confirm route; `requiresConfirmation` / `conversation.pendingConfirmation` |
| **CaptureFlowView** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Screens/CaptureFlowView.swift` | Primary intake UX; `createIntakeBatch`, media upload, `acknowledgeIntakeBatch`; resume by `initialBatchId` |
| **ShareIntakeHandoff** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Share/ShareIntakeHandoff.swift` | Share extension → v1 intake APIs; idempotent `clientBatchId` via `ShareUploadLedger`; returns `.intakeBatch(batchId)` |
| **AppRouter / destinations** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/App/AppRouter.swift` | `AppDestination`: `.intake` → `CaptureFlowView()`, `.intakeBatch(id)` → `CaptureFlowView(initialBatchId:)`, `.agent` → `AgentChatView()`; `DeepLink` maps `/intake`, `/capture`, `/agent` |
| **Repository** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Repositories/ExchangeRepository.swift` | `assistantConversation`, `assistantChat`, `assistantConfirm`; intake batch APIs |
| **DTOs** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Models/DTOs.swift` | `AssistantConversationPayload`, `IntakeBatchDetail`, etc. |
| **Entry** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/App/AppEnvironment.swift` | `ShareIntakeHandoff.consumeIfNeeded` on launch |
| **Tabs** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Screens/MainTabView.swift` | Agent tab embeds `AgentChatView` |
| **Intake alias** | `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Screens/IntakeView.swift` | Wraps `CaptureFlowView()` |
| **CI guards** | `/srv/gal/REMATCHER-Exchange-Mobile/scripts/ci/validate_capture_flow_safety.py` | Capture + ShareIntakeHandoff invariants |

Product spec (one thread per dealer, no device OpenAI): `/srv/gal/rematcher-exchange/app/docs/mobile-master-spec/10-media-agent.md`.

---

## 5. ExchangeMark / brand components

### Backend (Web)

| File | Role |
|------|------|
| `/srv/gal/rematcher-exchange/app/src/components/brand/exchange-mark.tsx` | `ExchangeMark` SVG component |
| `/srv/gal/rematcher-exchange/app/src/components/brand/exchange-mark.module.css` | Motion/state styles |
| `/srv/gal/rematcher-exchange/app/src/config/brand-v2.ts` | `ExchangeMarkState` type |
| `/srv/gal/rematcher-exchange/app/src/components/brand/exchange-mark-preview.tsx` | Dev preview |
| `/srv/gal/rematcher-exchange/app/src/app/brand/mark-preview/page.tsx` | `/brand/mark-preview` |
| `/srv/gal/rematcher-exchange/app/src/components/brand/agent-orb.tsx` | Agent orb UI |
| `/srv/gal/rematcher-exchange/app/src/components/brand/brand-mark.tsx`, `brand-wordmark.tsx`, `network-visualization.tsx` | Related brand |
| `/srv/gal/rematcher-exchange/app/docs/BRAND_SYSTEM.md` | Design system index |
| `/srv/gal/rematcher-exchange/app/tests/brand-ui-v2.test.ts` | Mark state coverage |

### Mobile (iOS)

| File | Role |
|------|------|
| `/srv/gal/REMATCHER-Exchange-Mobile/ios/REMATCHERExchange/Theme/BrandComponents.swift` | `ExchangeMark` SwiftUI view |
| Usage | `CaptureFlowView`, `HomeView`, `RootView`, `LoginView`, `GateRouter`, etc. |

Spec: agent processing UI may show Exchange Mark `searching` (`10-media-agent.md`).

---

## 6. Existing `Conversation*` names (stubs / types — not Prisma)

| Symbol | Location | Kind |
|--------|----------|------|
| `ConversationState` | `/srv/gal/rematcher-exchange/app/src/services/assistant/conversation-state.ts` | **Production** TS interface (agent authority) |
| `ConversationListItem` | same file | UI/list refs inside state |
| `ConversationStateToolName` | `/srv/gal/rematcher-exchange/app/src/services/assistant/agent-tools.ts` | Tool names that mutate in-memory state only |
| `ConversationExtract` | `/srv/gal/rematcher-exchange/app/src/services/intake/screenshot-demand.ts` | Intake LLM extract type |
| `mergeConversationSnippets` | `/srv/gal/rematcher-exchange/app/src/services/intake/conversation-text.ts` | Intake text merge |
| `ConversationList` (React) | `/srv/gal/rematcher-exchange/app/src/components/assistant/agent-workspace.tsx` | Web assistant sidebar list (not DB threads) |
| Agent Turn Plan “Conversation Core 3.0” | `/srv/gal/rematcher-exchange/app/src/services/assistant/agent-turn-plan.ts`, `turn-plan-schema.ts` | Structured planner JSON, not persisted threads |
| Tests | `/srv/gal/rematcher-exchange/app/tests/conversation-core-3-0.test.ts`, `agent-conversation-freedom-2-7.test.ts` | Turn plan / freedom regressions |

**No** `ConversationThread`, `ConversationMessage`, or `ConversationAction` Prisma models or API stubs found.

---

## 7. How to ADD `ConversationThread` / `Message` / `Action` without breaking Agent or Capture

### Principles (align with current contracts)

1. **Keep `runAssistantChatTurn` + Action Gateway as the mutation authority** until a deliberate cutover. New tables should mirror what gateway already writes to `ConversationState.pendingConfirmation` and `recentTurns`, not replace gateway in one step.
2. **One operational agent thread per dealer (V1)** per `10-media-agent.md`. Model as `ConversationThread { dealerId, kind: AGENT, ... }` with unique partial index on `(dealerId)` where `kind = AGENT` and `status = ACTIVE`.
3. **Capture stays on intake APIs.** Images/plates must not go through the agent loop. Optional `IntakeBatch.conversationThreadId` links capture-side Q&A or post-share clarification **without** changing batch create/ack/process pipelines in phase 1.
4. **Stored state wins:** preserve `resolveActiveConversationState` semantics; do not let Mobile POST a client blob override DB (already enforced in v1 chat route comments).

### Suggested layering

| Layer | Add | Leave unchanged initially |
|-------|-----|---------------------------|
| Prisma | `ConversationThread`, `ConversationMessage` (role, text, createdAt), `ConversationAction` (status, action key, payload Json, links to message) | `DealerMemoryItem` row for `agent_conversation_state_v1` |
| Persistence adapter | New `conversation-thread-persistence.ts`: dual-write on save — update `DealerMemoryItem.details.state` **and** append messages / upsert pending action row | `loadAgentConversationState` / `saveAgentConversationState` signatures used by orchestrator |
| Read path | Extend `getAssistantConversationPayload` to return `messages[]` from DB (fallback: `recentTurns` from memory item) | Mobile can keep using `recentTurns` until updated |
| Gateway | After `runActionGateway`, persist `pendingConfirmation` as `ConversationAction` `PENDING`; on confirm/cancel, transition action + append system message | `ConversationState.pendingConfirmation` field for Web + old clients |
| Intake | Add nullable `conversationThreadId` on `IntakeBatch` in **`/srv/gal/rematcher-exchange/app/prisma/schema.prisma`**; set when opening capture-linked thread; **do not** require it in `createOrResumeIntakeBatch` | `ShareIntakeHandoff`, `CaptureFlowView` batch idempotency |
| Privacy | Extend deletion: cascade or anonymize threads/messages; keep calling `forgetAllMemoryForDealer` for legacy blob | Retention policy in `/srv/gal/rematcher-exchange/app/src/services/privacy/policy.ts` (`agentConversationsMonths`) |

### Migration-safe sequence

1. Schema + migration (nullable FKs only).
2. Dual-write from `saveAgentConversationState` / end of `runAssistantChatTurn`.
3. Backfill job: one thread per dealer from latest `DealerMemoryItem` where `topicKey = agent_conversation_state_v1`.
4. Mobile/Web: optional read from messages table; confirm flow still hits `/api/v1/assistant/confirm` → same gateway.
5. Later: stop writing `recentTurns` to Json blob; read messages from table; keep slim `ConversationState` for drafts/focus/pending only.

### Files likely touched (additive)

- `prisma/schema.prisma` (+ migration)
- `src/services/assistant/conversation-persistence.ts` (delegate or dual-write)
- `src/services/assistant/assistant-chat-turn.ts` (`getAssistantConversationPayload`)
- `src/services/assistant/action-gateway.ts` (action row lifecycle)
- `src/services/privacy/deletion.ts` / `retention.ts`
- Mobile: `DTOs.swift`, `AgentChatView.swift` (optional richer history); **no change required** to `CaptureFlowView` until capture threads are productized

### Regression anchors

- `/srv/gal/rematcher-exchange/app/tests/intake-plate-gov-action.test.ts`
- `/srv/gal/rematcher-exchange/app/tests/api-v1-core-product.test.ts`
- `/srv/gal/rematcher-exchange/app/tests/conversation-core-3-0.test.ts`
- Mobile: `/srv/gal/REMATCHER-Exchange-Mobile/scripts/ci/validate_capture_flow_safety.py`

---

## 8. Quick architecture diagram (current)

```
Mobile AgentChatView
  → GET/POST /api/v1/assistant/chat
  → POST /api/v1/assistant/confirm
       → assistant-chat-turn.ts
       → v2-orchestrator.ts → agent-loop.ts
       → action-gateway.ts (+ action-truth sanitize)
       → domain services / Prisma
       → saveAgentConversationState → DealerMemoryItem (topic agent_conversation_state_v1)

Mobile CaptureFlowView / ShareIntakeHandoff
  → /api/v1/intake/batch (create, ack, media, text)
       → intake/batch.ts → IntakeBatch / IntakeMedia / IntakeText
       → processIntakeBatch → VehicleCandidate
  (no assistant chat route; conversation-text.ts for media classification only)
```

---

*End of scout.*
