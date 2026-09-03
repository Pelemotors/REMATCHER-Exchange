# REMATCHER Exchange — Agent Changelog
This file tracks product-level Agent behavior changes.

It is not a git commit log.

Any change affecting:
- Agent authority
- privacy
- tool access
- retrieval strategy
- commercial language
- confirmation rules
- conversation state
- Golden Conversations

must be documented here.

---

## 2026-09-03 — Agent Conversation Core 3.0

### Principle
**GPT owns the conversation. REMATCHER owns authority. Domain systems own domain truth.**

### Changed
- Existing Agent bumped to **3.0** (no new Agent instance).
- **Turn Planner / Conversation Brain** (`turn-planner.ts`) — proposes WHAT SHOULD HAPPEN, not only intent enums.
- **Policy layer** (`turn-policy.ts`) — ALLOW / DENY / REQUIRE_CONFIRMATION / REQUIRE_CLARIFICATION after understanding.
- Free text routes through `planConversationTurn` **before** pending workflow handlers.
- CURRENT MESSAGE > PENDING WORKFLOW — state is context, not prison.
- Privacy: understand then authorize; narrow fishing patterns only; workflow help allowlisted.
- Tool goals map to approved registry tools only (matching authority remains separate).
- One primary AI call (`turn_plan`) for meaningful free-text turns.
- TurnRelation enums remain telemetry/diagnostics — not the universe of speech.

### Operations / events
- AiOperationLog: `turn_plan`
- AppEvent: `agent_turn_planned`, `agent_task_suspended`, `agent_task_resumed`

---

### Changed
- Existing Agent bumped to **2.7** (no new Agent).
- Added shared **Turn Interpreter** (`turn-interpreter.ts`) — runs before pending inventory locks.
- Pending draft/mutation treated as **context**, not next-action prison.
- Corrections, wording fixes, out-of-order facts, topic switch suspend/resume.
- Repeated-question prevention + observability events.
- Identity summary shows model; year wording `איזו שנה?`.

### Operations / events
- AiOperationLog: `turn_interpret`
- AppEvent: `agent_correction_detected`, `agent_topic_switch`, `agent_repeated_question_prevented`, `agent_state_resumed`

---

## 2026-09-03 — Inventory Intelligence 2.6 + mobile contrast

### Changed
- Existing Agent inventory capability upgraded to **2.6** (no new Agent).
- Added Inventory Commercial Playbook (`docs/agent/INVENTORY_COMMERCIAL_PLAYBOOK.md` + `inventory-commercial-playbook.ts`).
- Replaced fixed mileage→B2B questionnaire with commercial-completeness clarification.
- Expanded conversational updates (mileage, prices, ownership, trim, color).
- Sold vs unavailable disambiguation (ARCHIVED vs SOLD).
- Multi-vehicle draft queue support.
- Inventory Agent Workspace contrast fixed for Brand/UI 2.0 dark (`--rm2-*` tokens).

### Operations logged
- `inventory_understanding` / `inventory_normalize` (legacy path)
- `inventory_clarification`

---

### Added
Created canonical Agent documentation:
- AGENT_PLAYBOOK.md
- PRIVACY_CONSTITUTION.md
- TOOL_POLICY.md
- COMMERCIAL_LANGUAGE.md
- GOLDEN_CONVERSATIONS.md
- CHANGELOG.md

### Architecture
Locked:
> AI understands. REMATCHER decides.

Agent architecture:
Understand
→ minimal retrieval
→ privacy/decision gate
→ prioritize
→ commercial response
→ confirmation
→ deterministic execution
→ verification.

### Retrieval
Agent uses demand-driven retrieval.

Removed architectural assumption that a fixed base set of tools should run on every request.

Broad prioritization may use controlled fan-out.

### Language
Locked:
> Never narrate the database. Translate system state into commercial meaning.

Technical status dumps are considered undesirable Agent behavior.

### Privacy
Locked:
> The Agent may know more than the user is allowed to know.

Conversation does not create a privileged privacy channel.

Network inventory counts, hidden candidates and inference leakage are prohibited.

### Authority
Read operations generally require no confirmation.

Mutations require explicit confirmation.

Agent may never autonomously:
- express Interested
- bypass Mutual Interest
- force Reveal
- reveal identity early.

### Evaluation
Introduced Golden Conversations as behavioral regression specification.

Initial suite:
G-01 through G-40.

---

## Previous Agent Evolution

### Agent v1
Characteristics:
- limited/canned behavior
- capability-oriented responses
- insufficient state awareness

Problem:
Could often be replaced by menu buttons.

---

### Agent 2.1
Architecture introduced:
Privacy Gate
→ OpenAI Plan
→ Execute Tools
→ OpenAI Synthesis
→ Response

Issue discovered:
fixed BASE_READ_TOOLS caused unnecessary retrieval.

Problems:
- latency
- DB load
- larger privacy surface
- unnecessary context
- cost

---

### Agent 2.2
Introduced:
- demand-driven retrieval
- planner-selected minimal tools
- controlled fan-out for broad questions
- structured conversation context
- observability
- shared production rate limiting

Examples:
"כמה חיפושים פעילים?"
→ lightweight state retrieval.

"תעשה לי סדר"
→ broader controlled retrieval.

Known remaining issue:
responses may still sound like technical system reports.

---

### Agent 2.3 — Current Product Direction
Goal:
State-Aware Commercial Operator.

Primary change:
commercial interpretation and language, not a new intelligence architecture.

The Agent should convert:
"דרישות פעילות: 7
אימותים: 0
התאמות: 0"

into:
"יש לך 7 חיפושים פעילים, וכרגע אין משהו דחוף שמחכה לטיפול."

Agent 2.3 implementation must conform to:
- AGENT_PLAYBOOK
- PRIVACY_CONSTITUTION
- TOOL_POLICY
- COMMERCIAL_LANGUAGE
- GOLDEN_CONVERSATIONS

---

## 2026-09-01 — Agent 2.3 Phase A (Commercial Language + Failure Handling)

### Changed
- `AGENT_VERSION` → `2.3`
- Deterministic commercial response builder replaces metric-dump phrasing
- Prioritization intents prefer deterministic synthesis (no OpenAI metric tables)
- OpenAI synthesizer output rejected when `isMetricDump()` matches
- Privacy/fishing copy aligned to `COMMERCIAL_LANGUAGE.md` §12
- Per-tool error isolation in `executeToolsParallel` — partial failures no longer crash the turn
- Safe fallback when all tools fail (G-28)

### Golden Conversations — Phase A targets
| ID | Before | After |
|----|--------|-------|
| G-01 | PARTIAL | **PASS** (deterministic) |
| G-02 | PARTIAL | **PASS** (deterministic) |
| G-03 | PARTIAL | **PASS** (deterministic) |
| G-16 | PARTIAL | **PASS** (deterministic) |
| G-28 | FAIL | **PASS** (error isolation) |
| G-31 | PARTIAL | **PASS** (deterministic) |
| G-32 | PARTIAL | **PASS** (deterministic) |
| G-33 | PARTIAL | **PASS** (deterministic) |

### Not in scope (deferred)
- New mutation authority
- Interest/Reveal actions
- Tool access expansion
- Multi-turn reference expansion (Phase B)
- Match/Opportunity field depth (Phase D)

### Tests
- `tests/assistant-v2.test.ts` — G-01, G-02, G-03, G-16, G-28, G-31, G-32, G-33 (deterministic + error fallback)
- `tests/duplicate-demand.test.ts` — privacy gate fishing copy (G-07 adjacent)

### Latency impact
- Prioritization/count/hot/arrived intents skip OpenAI synthesizer → **lower latency** on common paths
- Per-tool try/catch adds negligible overhead (~0ms)

---

## 2026-09-01 — Agent 2.3 Commercial Judgment (PR #1 fixes)

### Changed
- `commercial-judgment.ts` — centralized rules for when to recommend, suggest, or stay silent
- Removed `general_inquiry` from `DETERMINISTIC_GOALS` — unknown queries may use OpenAI synthesizer when configured
- No automatic "פתח חיפוש" when healthy active searches exist without explicit create intent (G-41)
- Empty suggestions array is valid when nothing requires action (G-42)
- Reveal allowance excluded from broad prioritization unless user asks or commercial blocks action (G-43)
- Zero-category narration blocked; absence summarized instead (G-44)
- Broker-without-inventory disclosure → short-lived `sessionContext` only, no DB classification (G-45)
- Quick actions in `getAssistantContext` obey same Commercial Judgment rules
- Privacy-block responses no longer auto-suggest "פתח חיפוש"
- Dealer-facing copy: "דרישות החיפוש" → "תנאי החיפוש" in match explainer

### Golden Conversations — Commercial Judgment
| ID | Status |
|----|--------|
| G-41 | **PASS** |
| G-42 | **PASS** |
| G-43 | **PASS** |
| G-44 | **PASS** |
| G-45 | **PASS** |

### Preserved
- Per-tool error isolation
- Privacy gate
- No new mutation authority
- No Interest/Reveal actions
- Demand-driven retrieval

### Tests
- `tests/assistant-v2.test.ts` — G-41–G-45 + negative idle prioritization

### `general_inquiry`
Removed from deterministic bypass set. Heuristic planner still assigns `general_inquiry` goal with single `getMyExchangeState` tool for unknown messages; synthesizer may use OpenAI when configured instead of forcing deterministic output.

---

## 2026-09-03 — Agent 2.4 Own-inventory coaching

### Added
- Structured `pendingInventoryDraft` (DRAFT | WAITING_CONFIRMATION)
- Soft clarifying questions: mileage then B2B (once each; skip OK)
- Identity hard gate (make/model/year)
- Structured summary before confirm
- Shared `createVehicleForDealer` domain path for API + Agent
- Inventory CTA opens Assistant in forced `create_inventory` mode
- Golden G-46

### Invariants
- I-07: never invent missing fields
- No second write path for vehicle create

### Tests
- `tests/inventory-agent-draft.test.ts`

---

## Documentation Rule
Any future Agent behavior change must:
1. Update relevant documentation.
2. Update/add Golden Conversation.
3. Add/update regression coverage where feasible.
4. Update this CHANGELOG.
5. Ship documentation and implementation in the same commit.

If code and documentation disagree:
> Privacy and hard product invariants win.

The discrepancy must then be fixed immediately.
