# Agent 2.2 — Gap Analysis vs `docs/agent/*`

**Date:** 2026-09-01  
**Baseline:** Agent 2.2 (`AGENT_VERSION = "2.2"`)  
**Source of Truth:** `docs/agent/` (v1.0)  
**Status:** Analysis only — **no production behavior changes**

---

## Executive Summary

Agent 2.2 has the correct **architecture skeleton** (privacy gate → planner → demand-driven tools → synthesis → confirmation for renew/close). Major gaps are in **commercial language quality**, **mutation coverage**, **multi-turn resolution**, **match/opportunity depth**, and **eval coverage** for Golden Conversations.

| Area | Compliant | Partial | Fail / Missing |
|------|-----------|---------|----------------|
| Architecture | ✅ | — | — |
| Demand-driven retrieval | — | ⚠️ | — |
| Commercial language | — | ⚠️ | — |
| Confirmation / mutations | — | ⚠️ | ❌ several intents |
| Multi-turn context | — | ⚠️ | — |
| Privacy / fishing | ✅ | ⚠️ | — |
| Interest / Reveal authority | ✅ | ⚠️ | — |
| Tool failure handling | — | — | ❌ |
| Golden Conversations (G-01–G-40) | 4 PASS | 18 PARTIAL | 18 FAIL/NOT IMPLEMENTED |

---

## Rule Matrix

| Rule | Current Implementation | Compliant? | Gap | Required Code Change | Required Test |
|------|------------------------|------------|-----|----------------------|---------------|
| **Product dependency** — Exchange works without Agent | Core flows via UI/API; assistant is optional overlay | ✅ Yes | — | — | Smoke: Exchange without `/api/assistant/chat` |
| **AI understands, REMATCHER decides** | `agent-constitution.ts`, deterministic services for mutations | ✅ Yes | Synthesizer can still over-explain | Tighten synthesizer prompt + deterministic templates | Constitution prompt regression |
| **Demand-driven retrieval** | `heuristicPlan()` + `planAgentTurn()`; no fixed 7-tool fan-out | ⚠️ Partial | `getMyExchangeState` runs 6 DB queries; `referencedObjectId` unused; opportunities missing from prioritization fan-out | Slim state tool; wire `referencedObjectId`; add opportunities to prioritization set | Tool-count assertions per intent (exists) + integration |
| **Commercial operator loop** | `buildDeterministicResponse()` prioritizes expiring → validation → inventory → matches | ⚠️ Partial | Playbook priority: Mutual Interest / Opportunity before validation; responses still metric-like when OpenAI synthesizes | Reorder priority; commercial templates for "nothing urgent" | G-01, G-02, G-03, G-33 eval |
| **Answer first, no "Exchange Assistant"** | `SYNTHESIZER_PROMPT`; deterministic path avoids assistant intro | ⚠️ Partial | OpenAI path not guaranteed; privacy message differs from spec wording | Align `privacyBlockedMessage()` to COMMERCIAL_LANGUAGE §12 | G-10, G-11 response text eval |
| **Read vs write confirmation** | Renew/close: prepare → confirm → execute | ⚠️ Partial | `update_demand`, `mark_sold`, `confirm_validation`, Interest, inventory update not wired in orchestrator | Handler branches in `v2-orchestrator.ts` for each `actionIntent` | Confirmation flow integration tests |
| **No silent mutation** | Only renew/close after explicit "כן" | ✅ Yes (for wired actions) | Other mutations unreachable or via UI only | Same as above | G-40 |
| **Multi-turn structured refs** | `lastList`, `pendingConfirmation`, `resolveListReference()` | ⚠️ Partial | Only demand list refs; no vehicle/match/opportunity; client-only state; "ראשון והשני" not supported | Extend `ConversationListItem` types; multi-select renew | G-05 |
| **Ambiguity handling** | Partial via list + title match | ⚠️ Partial | No disambiguation for multiple vehicles/demands by name alone | Name-based resolver with min distinguishing fields | G-23, G-24 |
| **Tool failure — no invention** | OpenAI/heuristic fallbacks for planner/synth | ❌ No | `executeToolsParallel` has no per-tool try/catch; Prisma error crashes turn | Wrap each tool; partial results + safe message | G-28 |
| **Privacy gate — fishing** | `checkPrivacyGate()` regex before tools | ✅ Yes | Message wording ≠ spec; no multi-turn fishing pattern | Update copy; optional session fishing counter | G-10, G-12 |
| **Privacy — inference leakage** | `INFERENCE_PATTERNS` on input | ⚠️ Partial | No output-side guard; "עדכן תקציב" not blocked | Output filter or block ambiguous budget-probe intents | G-13 |
| **No network tools** | Only `getMy*` dealer-scoped reads | ✅ Yes | No explicit deny-list at runtime | Optional planner validation | — |
| **Match card parity** | Matches tool returns count + href only | ⚠️ Partial | Cannot explain authorized match fields in chat | Enrich `getMyAuthorizedMatches` with presentation-safe fields | G-14, G-15, G-16 |
| **Interest authority** | No Interest write tools | ✅ Yes | No guided Interest flow with confirmation | Add prepare/execute Interest via domain services | G-18 |
| **Reveal authority** | No Reveal tools | ✅ Yes | No explanation handlers for identity/photos/grace | Privacy response templates + commercial status read | G-19, G-20, G-27, G-36, G-39 |
| **Validation ≠ Interest language** | Not enforced in synthesizer | ❌ No | LLM may conflate terms | Prompt + deterministic validation copy | G-21 |
| **Observability** | `AgentMeta`, `logAppEvent(assistant_v2_response)` | ⚠️ Partial | Missing plannerVersion, privacy block flag, confirmation flag in all paths | Extend meta schema | — |
| **Pending dealer blocked** | `(dealer)/layout` + `requireVerifiedDealer()` on assistant APIs | ✅ Yes | — | — | G-30 |
| **Documentation sync rule** | New `docs/agent/*` baseline | ✅ Yes (docs) | Repo rule needed | `.cursor/rules/agent-docs.mdc` | — |

---

## Golden Conversations — Classification

| ID | Scenario | Status | Notes |
|----|----------|--------|-------|
| G-01 | What should I do now? | **PARTIAL** | Fan-out works; "nothing urgent" phrasing inconsistent; may dump metrics via OpenAI |
| G-02 | One urgent action | **PARTIAL** | Deterministic synthesis can produce single-item answer; not guaranteed in production |
| G-03 | Multiple actions | **PARTIAL** | Unit test covers similar deterministic case; OpenAI path unverified |
| G-04 | Expiring searches | **PARTIAL** | Tool selection ✅ (`getMyExpiringDemands`); language depends on synthesizer |
| G-05 | Follow-up renew #1 and #2 | **PARTIAL** | Single ref renew works (`resolveListReference`); dual renew in one message not supported |
| G-06 | Create Demand | **PARTIAL** | `createDemandDraft` ✅; activation confirmation is UI-side, not Agent |
| G-07 | Duplicate Demand | **PARTIAL** | `findDuplicateDemand` in draft flow ✅; copy not fully aligned to spec |
| G-08 | Multiple Demands one sentence | **FAIL** | Single draft per message; no split |
| G-09 | Correction to draft | **FAIL** | No in-conversation draft state / correction |
| G-10 | Network fishing | **PASS** | `checkPrivacyGate` blocks; message wording differs slightly from spec |
| G-11 | Hidden count | **PASS** | Blocked by fishing patterns |
| G-12 | Iterative fishing | **PARTIAL** | Per-message blocks only; no cross-turn pattern detection |
| G-13 | Budget inference | **PARTIAL** | "תעלה תקציב" blocked; "אם אעלה ל-135" may not be; `update_demand` not executed |
| G-14 | Match explanation | **NOT IMPLEMENTED** | Matches return count only, no field-level explanation |
| G-15 | Alternative Match | **NOT IMPLEMENTED** | No authorized match detail in tools |
| G-16 | No Match | **PARTIAL** | Can answer from state count; safe phrasing not enforced |
| G-17 | Seller Opportunity | **PARTIAL** | Count in state; no conversational opportunity detail |
| G-18 | Seller Interest | **NOT IMPLEMENTED** | No Interest action flow |
| G-19 | Mutual Interest | **NOT IMPLEMENTED** | No Reveal/surface contact flow in Agent |
| G-20 | Identity before Reveal | **NOT IMPLEMENTED** | No dedicated privacy response handler |
| G-21 | Stale inventory | **PARTIAL** | Inventory attention tool exists; confirm flow not wired |
| G-22 | Mark sold | **PARTIAL** | `markMyVehicleSold` exists; orchestrator ignores `mark_sold` intent |
| G-23 | Ambiguous vehicle | **NOT IMPLEMENTED** | No vehicle disambiguation |
| G-24 | Close search by name | **PARTIAL** | Works with `lastList` ref; direct "טוסון" without list may fail |
| G-25 | No response ≠ reject | **NOT IMPLEMENTED** | No opportunity status language in Agent |
| G-26 | Commercial allowance | **PARTIAL** | `getMyCommercialStatus` exists; not in default fan-out |
| G-27 | Grace Reveal explanation | **NOT IMPLEMENTED** | No grace-specific commercial copy |
| G-28 | Tool failure | **FAIL** | No per-tool error handling |
| G-29 | OpenAI unavailable | **PASS** | Heuristic planner + deterministic synthesizer fallback |
| G-30 | Pending dealer | **PASS** | Blocked before Agent UI/API |
| G-31 | Anything hot? | **PARTIAL** | Falls to prioritization or generic state; no "hot" intent |
| G-32 | Did anything arrive? | **PARTIAL** | No dedicated intent; may use matches/opportunities counts |
| G-33 | Many zeroes prioritization | **PARTIAL** | Deterministic empty-state message exists; OpenAI may list zeros |
| G-34 | Hard constraint | **NOT IMPLEMENTED** | Matching engine enforces; Agent cannot explain constraint |
| G-35 | Unknown field | **NOT IMPLEMENTED** | No Agent explanation of unknown ≠ match |
| G-36 | Photos before Reveal | **NOT IMPLEMENTED** | No handler |
| G-37 | Identity inference | **NOT IMPLEMENTED** | No handler |
| G-38 | Seller floor | **NOT IMPLEMENTED** | No handler |
| G-39 | Bypass contact request | **PARTIAL** | General privacy gate; no Mutual Interest-specific template |
| G-40 | Task complete renew | **PARTIAL** | Renew + confirm works; verify message may omit days-left detail |

**Totals:** PASS **4** · PARTIAL **18** · FAIL **2** · NOT IMPLEMENTED **16**

---

## Priority Recommendations (Post-Review)

1. **Agent 2.3 language pass** — deterministic commercial templates; no metric dumps (G-01, G-02, G-03, G-33).
2. **Wire action intents** — `update_demand`, `mark_sold`, `confirm_validation` (G-09, G-22, G-21).
3. **Enrich authorized match/opportunity reads** — presentation-safe fields only (G-14–G-17).
4. **Per-tool error handling** (G-28).
5. **Golden Conversation eval suite** — automate G-01–G-40 over time.
6. **Privacy copy alignment** — match COMMERCIAL_LANGUAGE §12 / PRIVACY_CONSTITUTION §16.

---

## Files Reviewed

- `src/services/assistant/v2-orchestrator.ts`
- `src/services/assistant/planner.ts`
- `src/services/assistant/synthesizer.ts`
- `src/services/assistant/privacy-gate.ts`
- `src/services/assistant/conversation-state.ts`
- `src/services/assistant/tools/registry.ts`
- `src/services/assistant/tools/read-tools.ts`
- `src/services/assistant/tools/action-tools.ts`
- `tests/assistant-v2.test.ts`
