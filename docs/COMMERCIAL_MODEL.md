# Commercial Model — Reveal-based Subscription

## Principle (LOCKED DIRECTION)

We sell **access to a monthly quantity of quality connections created after mutual interest**.

- **Unit of value:** Reveal
- **NOT** success fee — billing does not depend on deal closure

## Reveal Definition

Reveal already requires:
```
Buyer Interested × Seller Interested → Mutual Interest → Reveal
```

Reveal **is** the qualified connection. No separate "Qualified Reveal" concept.

## Billing Event (LOCKED)

**Billing/usage event:** `reveal_created`

NOT billed: Candidate Match, Validation, B2B price, Interest, Opportunity, Outcome, Closed Deal.

## Reveal Usage Per Side

When Reveal X is created between two Dealers:
- Buyer Dealer → usage +1
- Seller Dealer → usage +1

Separate `RevealUsage` records with `@@unique([revealId, dealerId])` for idempotency.

## Free Onboarding (LOCKED)

- **5 Reveals free** per **Dealer** (not User)
- Not a trial package — real onboarding gift
- Additional users under same Dealer do not get another 5

## Plans (Configurable — WORKING DIRECTION)

| Plan | Reveals/month | Price |
|------|---------------|-------|
| Onboarding | 5 free lifetime | ₪0 |
| Dealer | 15 | ₪2,990 |
| Dealer Pro | 30 | ₪5,490 |
| Dealer Max | 60 | ₪8,990 |

Config: `src/config/commercial.ts`

## Outcome & Billing (LOCKED)

Outcome **does not** affect billing. User-facing message:

> העדכון לא משפיע על החיוב. הוא עוזר ל-REMATCHER Exchange ללמוד ולשפר את ההתאמות הבאות.

## UX Guidelines

- Do NOT present as game credits
- Prefer: `12 מתוך 15 חיבורים החודש`
- Free: `נשארו לך 3 מתוך 5 החיבורים הראשונים ללא עלות`
- Do NOT warn about Reveal cost on "מעניין אותי" — Reveal only on mutual interest

## Implementation

| Component | Location |
|-----------|----------|
| Plans config | `src/config/commercial.ts` |
| Usage tracking | `src/services/commercial/reveal-usage.ts` |
| Reveal + Outcome flow | `src/services/commercial/reveal-flow.ts` |
| Schema | `DealerCommercial`, `RevealUsage`, `Outcome` |
| API | `/api/commercial/usage`, `/api/reveals/[id]` |
| UI | Home, Account, Reveal page |

## Pilot Metrics

Primary: **Reveal → Deal %**

Also track: Outcomes, time Reveal→Outcome, conversion by match strength / price gap / freshness / Dealer.

## P-61 — Grace Reveal (WORKING DIRECTION)

When allowance is exhausted **but Mutual Interest already exists**:
- Reveal **proceeds** — protect the value moment
- `RevealUsage.source = GRACE`
- `DealerCommercial.planStatus = ACTION_REQUIRED`
- Block **new** buyer/seller interest (not ripened mutual flows)

No payment provider in pilot — commercial action is a flag, not billing.

## OPEN Decision

**P-61 overage billing / upgrade UX** — deferred until post-pilot. Grace Reveal is the pilot behavior.
