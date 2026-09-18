# AGENT_CAPABILITY_CONTRACT

Source of truth for the ONE REMATCHER Agent. AI understands; REMATCHER decides and executes.

## Invariants

| Rule | Meaning |
|---|---|
| AI UNDERSTANDS | Natural Hebrew, context, tool selection, explanation |
| REMATCHER EXECUTES | Authorization, scope, privacy, mutations, Reveal, truth |
| ZERO RE-ENTRY | Never re-ask known facts (esp. known plate) |
| NO INVENTED TRUTH | No vehicle/GOV/match/price/count from language alone |
| ACTION TRUTH | Confirmation / success copy only from deterministic pending / executor |
| PRIVACY | No cross-dealer identity before Reveal; aggregates only |

## Capability matrix

| Capability | Dealer job | Reads | Writes | Confirm? | Privacy | Automated coverage | Status |
|---|---|---|---|---|---|---|---|
| GENERAL | What’s going on / pending | getMyExchangeState, getMyPendingActions | — | — | own | PARTIAL (existing agent/state tests) | PARTIAL |
| INVENTORY READ | My stock / attention | getMyInventory*, enrichment | — | — | own | PASS inventory tools tests | PASS |
| INVENTORY CREATE/UPDATE | Add/update stock | draft tools | propose_mutation INVENTORY | YES | own | PASS ingest/manage + action-truth | PASS |
| SOLD vs ARCHIVE | Sold ≠ remove | — | MARK_SOLD / ARCHIVE | YES | own | PASS archive-lifecycle | PASS |
| SEARCH READ | Active / expiring | getMyActiveDemands, inspect/summarize | — | — | own | PASS search tools | PASS |
| SEARCH MUTATE | Create/update/close/renew | draft_search_intent | SEARCHES propose | YES | own | PASS search-capability | PASS |
| CUSTOMERS | People ≠ demands | get_my_customers, find_my_customer | via demand confirm | phone confirm | own | PASS phone attribution | PASS |
| PRIVATE MATCH | Vehicle↔my demands / demand↔my inventory | private_match_* | — | — | own private OK | PASS private-demand-match | PASS |
| NETWORK MATCHES | Authorized matches | getMyAuthorizedMatches | — | — | anonymized until Reveal | PASS matching | PASS |
| VALIDATIONS | Availability confirm | getMyPendingValidations | CONFIRM_VALIDATION | YES | own | PARTIAL | PARTIAL |
| SELLER OPPORTUNITIES | Interest on my cars | getMyOpportunities | — | — | hide buyer | PARTIAL | PARTIAL |
| DEALER OPPORTUNITIES | Attention reasons | get_my_dealer_opportunities | — | — | no identity leak | PARTIAL | PARTIAL |
| REVEALS | Post-mutual contact | getMyReveals | — | — | authorized only | PARTIAL | PARTIAL |
| OUTCOMES | Explicit business events | getMyPendingOutcomes | report_business_event | YES when mutate | own | PARTIAL | PARTIAL |
| INTELLIGENCE | Market overview / demand / supply / buy / liquidity / trade / customers | runExchangeIntelligenceEngine | — | — | aggregates; synthetic isolated | PASS intel privacy + contributor | PASS |
| MARKET WATCH | Follow model | list/create | create_market_watch | no demand create | own | PASS watch canonical | PASS |
| ACTIVITY | What needs attention | notifications APIs | mark read | — | own | Mobile ActivityView nav fix | PARTIAL |
| COMMERCIAL | Usage / entitlement | getMyCommercialStatus, getMyEntitlement | — | — | service truth | PARTIAL | PARTIAL |
| MEMORY | Durable dealer prefs | get_my_dealer_memory | remember/correct/forget | — | own | PARTIAL | PARTIAL |
| INTAKE | Capture candidates | get_my_intake_* | CONFIRM/REJECT/RESOLVE/RETRY | YES | own | PASS plate-gov + action truth | PASS |
| HELP | Product explanation | constitution / docs | — | — | — | PARTIAL | PARTIAL |
| ACTION TRUTH | Pending confirm lifecycle | pendingConfirmation | confirm/cancel | MUST | dealer-scoped | PASS intake-plate-gov-action | PASS |
| SYNTHETIC MARKET | Beta intel density | network* allowSynthetic | seed script | — | REAL never sees SYNTHETIC | PASS market-scope + migration | PASS |

## Example Hebrew (non-exhaustive)

- מלאי: «יש לי CX5 2022», «תעדכן 80 אלף ק״מ», «נמכר», «תוריד מהמלאי»
- חיפוש: «אני מחפש CX5 עד 140», «תחדש», «תסגור»
- קליטה: «דחה את המועמד», «מאשר», «לא»
- מודיעין: «תן לי תמונת מצב», «בדוק ביקוש», «המחיר כדאי?»

## Failure behavior

| Failure | User-facing |
|---|---|
| No pending + מאשר | No mutation; clarify no pending action; log inconsistency if prior turn claimed pending |
| GOV NOT_FOUND + plate known | Never re-ask plate; show unverified plate message |
| Insufficient intel cohort | Hebrew insufficient copy; no invented counts; no raw privacy English |
| Tool/OpenAI down | Could not verify — never invent business truth |

## Device acceptance (post-RC)

See GOLDEN_FLOWS.md + RELEASE_MASTER_AUDIT.md. Codemagic/Xcode/device not claimed from Linux alone.
