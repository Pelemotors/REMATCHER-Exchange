# FAILURE_SURFACE_MATRIX

| Surface | Failure mode | User message rule | Status |
|---|---|---|---|
| Intake GOV NOT_FOUND | Plate known | Never re-ask plate | PASS |
| Intake GOV UNAVAILABLE | Plate known | Preserve + allow continue/retry | PASS |
| Intake no plate | Missing plate | Ask plate once | PASS |
| Action Gateway | Confirm w/o pending | No mutation; clarify | PASS |
| Action Gateway | LLM claimed pending | Sanitize + log inconsistency | PASS |
| Intelligence | Insufficient cohort | Hebrew insufficient; no invent | PASS |
| Intelligence | privacyNote | Never show raw English aggregates disclaimer | PASS |
| Matching | Cross-dealer | Scope deny | PASS (existing) |
| Notifications | null fields | Sanitize labels | PASS (Mobile) |
| Navigation | Nested stack | Remove on pushed destinations | PASS (Activity) |
| Synthetic | REAL dealer | Zero synthetic contribution | PASS (market-scope) |
| OpenAI down | Chat | Could not connect — no invented truth | PASS (agent-loop) |
