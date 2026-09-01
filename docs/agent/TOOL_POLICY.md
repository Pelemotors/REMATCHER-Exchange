# REMATCHER Exchange — Agent Tool Policy
Version: 1.0

## 1. Principle
> Tools expose capabilities. Authorization determines truth.

A tool existing internally does not mean its output is safe to show.

Agent tools must be:
- dealer-scoped
- authorization-aware
- privacy-safe
- auditable
- minimal

---

## 2. Retrieval Rule
Use the minimum number of tools required to complete the task.

No default "load everything" bundle.

Broad prioritization requests may use controlled fan-out.

---

## 3. Approved Read Tools

### getMyExchangeState
Purpose:
High-level own-account state.

Use for:
- "כמה חיפושים יש לי?"
- lightweight Agent context
- high-level status

Must not contain hidden network counts.

---

### getMyActiveDemands
Purpose:
Dealer's active searches.

Allowed:
own Demand data only.

---

### getMyExpiringDemands
Purpose:
Find searches requiring renewal attention.

---

### getMyDemandHistory
Purpose:
Dealer's expired/closed Demand history.

---

### getMyDemand
Purpose:
Retrieve one authorized Demand.

---

### findMySimilarDemands
Purpose:
Prevent accidental duplicate searches.

Must search only user's own Demands.

---

### getMyInventory
Purpose:
Dealer's own inventory.

---

### getMyInventoryItem
Purpose:
One dealer-owned inventory object.

---

### getMyInventoryRequiringAttention
Purpose:
Inventory requiring action.

Examples:
- stale
- missing availability confirmation

---

### getMyStaleInventory
Purpose:
Freshness workflow.

---

### getMyPendingValidations
Purpose:
Validation actions assigned to this dealer.

Validation ≠ Interest.

---

### getMyAuthorizedMatches
Purpose:
Matches already authorized for presentation.

Must return only presentation-safe fields.

---

### getMyOpportunities
Purpose:
Seller Opportunities legitimately visible to this dealer.

---

### getMyReveals
Purpose:
Connections already revealed to this dealer.

---

### getMyPendingActions
Purpose:
Authorized actionable items.

Must not derive hidden network information.

---

### getMyCommercialStatus
Purpose:
Dealer's own commercial state.

Examples:
ACTIVE
ACTION_REQUIRED
SUSPENDED

---

### getMyRevealUsage
Purpose:
Dealer's own Reveal/connection usage.

Never expose another dealer's usage.

---

## 4. Approved Write / Preparation Tools

### createDemandDraft
May create a draft from natural language.

Must not silently activate it.

Duplicate check should run.

---

### prepareDemandUpdate
Returns proposed changes.

No mutation.

---

### executeDemandUpdate
Requires explicit user confirmation.

---

### prepareDemandRenewal
No mutation.

---

### executeDemandRenewal
Requires explicit confirmation.

---

### prepareDemandClosure
No mutation.

---

### executeDemandClosure
Requires explicit confirmation.

---

### prepareInventoryUpdate
No mutation.

---

### confirmInventoryAvailability
Requires explicit confirmation when changing state.

---

### markMyVehicleSold
Requires explicit confirmation.

---

## 5. Interest Actions
Any Buyer/Seller Interested action:
- must use deterministic Exchange service
- must require explicit user intent
- must be idempotent
- must preserve audit trail

The LLM must never directly write Interest state.

---

## 6. Reveal
There is no Agent tool:
forceReveal()
manualReveal()
revealDealerIdentity()

Reveal is a deterministic consequence of valid Mutual Interest.

The Agent may navigate the user to an authorized Reveal.

---

## 7. Forbidden Tools
Never introduce:
searchAllDealerInventory
getAllNetworkVehicles
countHiddenCandidates
getOtherDealerDemands
getHiddenSellerFloor
getHiddenBuyerMaximum
findVehiclesJustOutsideBudget
getHiddenLiquidity
getDealerIdentityBeforeReveal
getOriginalVehiclePhotosBeforeReveal

Do not create differently named tools that provide equivalent capability.

---

## 8. Forbidden Derived Tools
Also prohibited:
"recommendBudgetIncreaseFromHiddenInventory"
"explainWhyNoMatchUsingHiddenCandidates"
"countNearMatches"
"tellMeWhatWouldUnlockMatches"

if their result depends on unauthorized hidden network state.

---

## 9. Confirmation Matrix

READ:
No confirmation.

NAVIGATION:
No confirmation.

CREATE DRAFT:
Normally no confirmation.

PREPARE MUTATION:
No confirmation.

EXECUTE MUTATION:
Confirmation required.

INTERESTED:
Explicit confirmation/intent required.

REVEAL:
Never manually executed by Agent.

---

## 10. Tool Failure
If tool fails:
- do not synthesize imaginary result
- do not reuse stale state as current without labeling it
- return safe failure
- allow retry where appropriate

---

## 11. Observability
Every Agent run should record safe metadata:
- agentVersion
- plannerVersion
- selected tools
- tool durations
- plannerDurationMs
- synthesisDurationMs
- success/failure
- fallbackReason
- privacy block
- confirmation required
- action completed

Do not log:
- secrets
- API keys
- passwords
- raw reset/verification tokens
- unnecessarily sensitive hidden network data
