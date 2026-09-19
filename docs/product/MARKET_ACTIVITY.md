# Market Activity + Decision Snapshot

Canonical product path:

`Decision → Market Activity collection → Decision Snapshot`

The dealer receives one coherent picture. Existing intelligence engines stay internally.

## Comparable cohort

Reused from `src/services/exchange-intelligence/engine.ts`. There is no second definition of “similar vehicle”.

Dimensions:

- `canonicalizeMake` / `canonicalizeModel` — never compare raw Hebrew/English strings
- year window from `yearWindowForCohortLevel` (exact, then ±1, then ±2)
- fuel / fuel family when known
- market-scope isolation (`REAL` vs `SYNTHETIC`) via `marketsCompatible`

Tolerances live in the engine (year widening + fuel family). Market Activity does not invent another matcher.

## Thresholds

Single source: `src/services/market/thresholds.ts`.

Defaults:

- min cohort observations = 3 (`NETWORK_INTEL_MIN_COHORT`)
- min distinct dealers = 3 (`NETWORK_INTEL_MIN_DISTINCT_DEALERS`)
- min price-distribution observations = 5
- min total supply+demand for marketability = 6
- HIGH requires demand ≥ 5 and supply ≥ 3 and demand/supply ≥ 1.5
- LOW requires supply ≥ 5 and demand/supply ≤ 2/3

Empty network or tiny sample → `UNKNOWN`. 1 demand / 0 supply is never HIGH.

## Marketability (סחירות)

Deterministic. Not an LLM score. No 8.4/10.

See `computeMarketability` in `src/services/market/marketability.ts`.

Coverage: `SUFFICIENT` | `LIMITED` | `INSUFFICIENT`.

If coverage ≠ `SUFFICIENT` → band `UNKNOWN`.

Dealer-facing copy:

- `אין כרגע מספיק מידע כדי לקבוע`
- `אין מספיק רכבים דומים כדי לתת טווח אמין`

No privacy-threshold language.

## Facts only

Allowed: supply, demand, CandidateMatch counts (30-day `createdAt` only), real BuyerInterest, real Reveals, dealer-local customer-match count, asking-B2B price position.

Not exposed: deal volume, median deal price, time-to-sell, conversion, transaction volume.

Match ≠ Deal. Interest ≠ Deal. Reveal ≠ Deal.

Price position compares Decision prices to network **asking B2B**, never acquisition vs unrelated retail.

## Snapshot API

`GET /api/v1/inventory/:vehicleId/decision/snapshot`

OPEN Decision only gets an active workspace snapshot. Terminal history is not mutated.

## Intelligence action matrix

| Action | Task 7 status |
| --- | --- |
| CHECK_BUY_PRICE | WRAP — price position uses asking-B2B from MARKET_OVERVIEW |
| CHECK_DEMAND | REUSE — demand counts from MARKET_OVERVIEW |
| CHECK_SUPPLY | REUSE — supply counts + asking range from MARKET_OVERVIEW |
| CHECK_LIQUIDITY | SUPERSEDED FOR UI — marketability replaces liquidity as primary |
| CHECK_TRADE_RISK | SUPERSEDED FOR UI — trade snapshot comparison replaces it |
| MATCH_MY_CUSTOMERS | WRAP — aggregate count only in snapshot (no PII) |
| MARKET_OVERVIEW | REUSE — shared primitive with Market Pulse |

Endpoints stay for compatibility/tests.
