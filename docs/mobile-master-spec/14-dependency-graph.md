# 14 — Dependency Graph

```
Gate 0 (this spec approved)
    │
    ├── B01 ──┬── B05
    │         └── B02 ── B03 ── M07
    │                      │
    │                      ├── B04 (also parallel on /api/* IDOR from B01)
    │                      ├── B06 ── B12
    │                      ├── B07
    │                      ├── B08 ── B09
    │                      ├── B10
    │                      ├── B11
    │                      ├── B13 ── B14 ──┐
    │                      │                ├── B16
    │                      └── B13 ── B15 ──┘
    │                      └── B17 (after POLICY)
    │                      └── B19
    │
    ├── B18 (parallel anytime)
    │
    └── M01 ── M02 ── M03/M04 (parallel) ── M05 ── M06 ── M08 ── M09
                                              │
                                              └── M10 (token plumbing; send waits B14/B15)

Gate 1 = B01–B05 + B04 IDOR + isolated auth tests A≠B / revoke / suspended

P01 (Login) ── P02 (gates)
    └── P03 Home ──┬── P04 Capture
                   ├── P05 Inventory
                   ├── P06 Demand
                   ├── P07 Matches / P10 Opp / P09 Val / P11 Reveal
                   ├── P12 Activity
                   ├── P13 Agent
                   └── P14 Account
                         ├── P15–P17 secondary
```

## Parallel workstreams after Gate 0

| Stream | Packages | Blocked by |
|---|---|---|
| API door | B01, B05, B18 | Gate 0 |
| Auth | B02, B03 | B01 |
| Hardening | B04 | can start IDOR immediately |
| Native shells | M01–M06, M08 | Gate 0; URLSession against Production only after Gate 1 |
| Domain v1 | B06–B11, B19 | B03 |
| Push | B13–B16, M10 | B03; send credentials |
| Deletion | B17 | legal POLICY |
| Product UI | P* | Gate 1 + M07 |

## Cannot parallel

- M07 live Production login after Gate 1 (no seed users; real dealer).
- P04 live uploads before B12 Bearer media.
- Store push proof before B14/B15 credentials.
- Gate 6 before Gate 5 device matrix.

---

## Gates (hard)

| Gate | Exit |
|---|---|
| **0** | This spec approved. No code. |
| **1** | Backend P0: v1 auth, envelope, A≠B, revoke, suspended, device IDOR fixed; isolated tests; Production migrate after backup |
| **2** | iOS build/run against live Production login+me+tabs (Android UI not required for M1) |
| **3** | Core parity: Home, Capture, Inventory, Demand, Matches, Opp, Val, Reveal |
| **4** | Push, deep links real AASA/assetlinks, media, Agent, account lifecycle (deletion per policy) |
| **5** | Real devices, RTL, security retest, Web regression |
| **6** | TestFlight + Play testing track |
| **7** | Store checklists complete; Production flavor; no Dev URL |

No skipping because “it looks like it works”.
