# Agent Decision Constitution

## Agent Role

The Agent is **not** a chatbot that decides freely. It is a **Commercial Decision Orchestrator**:

- Understand information
- Identify opportunities and missing data
- Decide when human action is worthwhile
- Return the right person at the right moment
- Learn from outcomes

**Business Gates remain deterministic.**

## Core Principle (LOCKED)

> **AI understands. Our system decides.**

OpenAI may: parse, normalize, interpret, classify, explain, assist ranking.

OpenAI may **NOT** alone determine: Hard Constraint override, Interest, Mutual Interest, Reveal, billing, privacy, permissions, authorization.

## Master Decision Chain

```
Event
  → Understand
  → Verify Data
  → Hard Constraint Gate
  → Candidate Generation
  → Unknown / Confidence Evaluation
  → Determine Missing Information
  → Decide Whether Human Action Is Worthwhile
  → Validation
  → Recalculate
  → Present
  → Buyer Interest
  → Seller Opportunity
  → Seller Interest
  → Mutual Interest
  → Reveal
  → Record Reveal Usage
  → Outcome
  → Learn
```

Every feature must integrate into this chain — not bypass it.

## Event Taxonomy

Implemented via `AppEvent` + domain services:

| Event | Trigger |
|-------|---------|
| `inventory_added` / `inventory_updated` | Inventory CRUD |
| `demand_created` / `demand_confirmed` | Demand flow |
| `candidate_match_created` | Matching engine |
| `availability_confirmed` | Validation (≠ Interest) |
| `b2b_price_updated` | B2B price validation (≠ Interest) |
| `buyer_interested` / `buyer_rejected` | Buyer response |
| `seller_opportunity_created` | After buyer interest only |
| `seller_interested` / `seller_rejected` | Seller response |
| `mutual_interest_created` | Both sides interested |
| `reveal_created` | Mutual interest gate passed |
| `outcome_received` | Post-reveal feedback |

## Key Gates (Implementation Status)

| Gate | Rule | Status |
|------|------|--------|
| Hard Constraint | Always beats score | ✅ `matching/engine.ts` |
| Unknown | Unknown ≠ Match | ✅ engine |
| Validation | ≠ Interest (I-04) | ✅ `matching-flow.ts` |
| B2B Price | ≠ Interest, ≠ Reveal | ✅ validation + recalc |
| Buyer Presentation | 90/75 thresholds | ✅ engine |
| Seller Opportunity | Only after buyer interest | ✅ `recordBuyerInterest` |
| Mutual Interest | buyer AND seller interested | ✅ `recordSellerInterest` |
| Reveal | Only mutual interest | ✅ `createRevealFromMutualInterest` |
| Reveal Authorization | Backend enforces dealer membership | ✅ API + service |
| Human Action Worthiness | Don't validate weak candidates | ⚠️ partial (freshness/B2B triggers) |

## Data Truth Model

Fields should conceptually support: **Value + Source + Confidence/Status**

- `fieldProvenance` on Vehicle
- `DemandConstraint.source` (user_confirmed vs parsed)
- AI logs in `AiOperationLog`

## Long-Term Direction

Evolve from Similarity Matching Engine → Deal Probability Engine. Capture learning data now; no complex ML in MVP.
