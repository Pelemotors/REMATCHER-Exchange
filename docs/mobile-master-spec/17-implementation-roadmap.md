# 17 — Implementation Roadmap

Time estimates in calendar days are **out of scope**. Complexity/risk/parallelism are in.

---

## Phase A — Backend P0
**Packages:** B01, B02, B03, B04, B05, B18  
**Parallel:** B18 + B01; B04 IDOR on existing `/api` while B02 is written.  
**Complexity:** M–H (auth). **Risk:** R1, R3, R10.  
**Exit = Gate 1:** Isolated auth tests (login/refresh/revoke, A≠B, envelope, IDOR, SUSPENDED). Production is the real iPhone backend **after** those gates + backup/migrate — not a destructive sandbox.

## Phase B — Native foundations
**Packages:** M01–M10 (M07 live only after Gate 1)  
**Parallel:** iOS (M03) ∥ Android (M04) after M02.  
**Complexity:** M. **Risk:** R7 flavors.  
**Exit = Gate 2:** iOS tab shell against live Production `/me` (Android UI not required for Milestone 1).

## Phase C — Core dealer experience
**Packages:** B06–B10, B12, B19 (as needed), P01–P12, P15–P17  
**Parallel:** Inventory/Demand/Matches streams after B03.  
**Complexity:** H (Capture). **Risk:** R7, R11.  
**Exit = Gate 3:** parity of Home, Capture, Inventory, Demand, Matches, Opportunity, Validation, Reveal, Activity.

## Phase D — Agent + native capabilities
**Packages:** B11, B13–B16, P13, M09/M10 live, share-in if D-P3  
**Complexity:** H (push certs). **Risk:** R4.  
**Exit = Gate 4:** push on real devices, Universal Links, Agent, media Bearer.

## Phase E — Compliance / QA
**Packages:** B17 (after POLICY), P14 deletion, device matrix, RTL, Web regression  
**Complexity:** M–H (policy). **Risk:** R5, R6, R9.  
**Exit = Gate 5.**

## Phase F — Test distribution
TestFlight + Play internal/closed. Milestone 1 Debug already uses Production API; Store submission is still Gate 6+.  
**Exit = Gate 6.**

## Phase G — Store release
Store checklists, signing, monitor. Canonical API remains `https://exchange.rematcher.co.il`.  
**Exit = Gate 7.**  
Web Production remains the business system.

---

## First package after approval

**B01 — Mobile API foundation**  
**Required gate: Gate 0** (this document set approved).  

Do not start B01, M01, or any `src/` change until explicit approval.

---

## What this roadmap does not do

- Does not create the Mobile git repository.
- Does not add `/api/v1` yet.
- Does not migrate Postgres.
- Does not “fix while specifying” remaining IDOR (scheduled as B04).
