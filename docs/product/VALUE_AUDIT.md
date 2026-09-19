# Value audit — four core questions

Lightweight factual status. No measurement system.

## Question 1 — מה כדאי לי לעשות עכשיו?

Status: not Task 7.

## Question 2 — האם כדאי לי לקחת את הרכב הזה?

Status after Task 7: canonical Decision Snapshot answers this with facts, not a BUY / DON'T BUY verdict.

- OPEN PURCHASE → `תמונת קנייה`
- OPEN TRADE → `תמונת טרייד` (incoming + outgoing + comparison)
- Market Activity (`פעילות שוק`) is the shared fact layer
- Dealer decides

## Question 3 — האם יש לי קונה / רכב מתאים?

Current status from code audit (no refactor in Task 7):

- `MATCH_MY_CUSTOMERS` / `matchPrivateVehicleToMyDemands` already match this dealer's Customers/Demands
- Snapshot now surfaces a dealer-local aggregate count automatically
- Matching UX itself is unchanged

## Question 4 — מה קורה בשוק של הרכב הזה?

Market Activity component built in Task 7 and wired into Decisions.

Broader Vehicle Detail / Search / Market Pulse UI comes later. Market Pulse still uses the same MARKET_OVERVIEW primitive.
