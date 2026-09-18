# Product Contract — Exchange Intelligence & Market Signals

Invariants for network intelligence, agent tools, and market APIs (VNext).

## Privacy & aggregation

- **No cross-dealer identity** in intelligence, tape, pulse, or agent tool payloads (no dealer id, business name, phone, or contact JSON).
- **No raw cross-dealer rows** — only cloaked counts and distribution medians when cohort thresholds are met (`NETWORK_INTEL_MIN_COHORT`, `NETWORK_INTEL_MIN_DISTINCT_DEALERS`).
- **Suppress small cohorts** — when thresholds fail, return `insufficientData: true` and null counts; never leak sub-threshold activity.
- **No individual transaction prices** on the public tape; price families in intelligence are network medians only, never tied to a dealer.
- **Customer phone** must not appear in LLM tool results when avoidable (`includeCustomerPhone: false` for agent paths).

## Agent read tools (authorized services only)

| Natural question | Service |
|------------------|---------|
| Market overview / demand / supply / liquidity / trade risk | `runExchangeIntelligenceEngine` via `run_exchange_intelligence` |
| Own vehicle ↔ own demands | `private-matching` / `private_match_vehicle_to_my_demands` |
| Own demand ↔ own inventory | `private-matching` / `private_match_demand_to_my_inventory` |
| Market watches list / create | `market-watch/watches` |

Writes (inventory, demands, mutations) remain **Action Gateway + confirmation** — agent tools do not bypass confirmation.

## HTTP APIs

- `GET /api/v1/market/pulse` — dealer-scoped counts + optional anonymous `MARKET_OVERVIEW` for a make/model focus (query or first active watch).
- `GET /api/v1/market/tape` — aggregated `ExchangeEvent` segments by event type + make/model; small cohorts suppressed.

## Constitutional alignment

See [INVARIANTS.md](../INVARIANTS.md) (I-01 no browse-all, I-02 identity until mutual interest, I-07–I-09 no invented data, I-19 inference risk).

## Account deletion

Operational and aggregate learning rows may be retained per [ACCOUNT_DELETION_DATA_INVENTORY.md](../release/ACCOUNT_DELETION_DATA_INVENTORY.md); dealer PII is anonymized, not silently deleted for all transactional FKs.
