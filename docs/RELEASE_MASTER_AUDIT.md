# RELEASE_MASTER_AUDIT — Device remediation + Agent hardening

Date: 2026-09-18
Scope: Production forensic + fixes + synthetic beta market + Mobile RC prep
Codemagic: NOT triggered

## Forensic snapshot (pre-fix)

| Subject | Evidence |
|---|---|
| Plate 4656581 | candidate `cmu7b2ey5003tjkye1le0j88p`, batch `cmu7b1wpg000sjkyezsy37b12`, dealer `cmu4haqxy0000jkfm0onmj86h` (galsamama). status=NEEDS_INFO, govState=NOT_FOUND, missingFields=[detectedPlate], confidence=MEDIUM, intent=OWNED |
| Plate 83089302 / Clio 2022 | COMMITTED OFFERED_TO_ME → vehicle `cmu7b456n006rjkyep6kx35dk` |
| Plate 7697737 / Qashqai 2016 | COMMITTED TRADE_IN_CANDIDATE → `cmu7b7qw8008ajkyev36r3bvz` |
| Plate 1666667 / Giulietta 2010 | COMMITTED OWNED → `cmu7b36hq005djkye9ra8aobj` |
| Agent מאשר / no pending | Action Gateway returns «אין פעולה ממתינה» when LLM claimed confirm without persisted pendingConfirmation |

## Device issue matrix (summary)

| Issue | Root cause | Fix | Status |
|---|---|---|---|
| Ask plate despite OCR 4656581 | GOV NOT_FOUND → missingFields detectedPlate; Mobile needsClarification on NEEDS_INFO | plate-identity READY + no missing plate; Mobile plateIdentityState UX | PASS |
| מאשר → no pending | LLM prose without gateway pending | action-truth sanitize + gateway always creates pending for INTAKE | PASS |
| Privacy English leak | privacyNote in intel/pulse/tape | removed from user-facing payloads | PASS |
| Bell / Activity loop | nested NavigationStack in ActivityView | removed; use parent stack | PASS |
| null null year | unsafe vehicle label | sanitizedVehicleField / vehicleDisplayLabel | PASS |
| Thin intel market | low real density | Synthetic Beta Market isolation + seed | PASS |

## Release SHAs

Filled at deploy time in final response.
