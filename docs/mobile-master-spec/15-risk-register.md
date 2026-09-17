# 15 — Risk Register

| ID | Risk | P | I | Detection | Mitigation | Gate |
|---|---|---|---|---|---|---|
| R1 | Auth migration issues (token reuse, clock, Keychain) | M | H | Isolated auth tests | Rotation + family revoke; 15m access | 1 |
| R2 | Web regression from shared service edits | M | H | `npm test`; live Web smoke after Production deploy | Additive v1; no cookie rewrite | 1–5 |
| R3 | Dealer isolation / IDOR (device revoke known) | H | H | A≠B matrix | B04 first-class; no mocks-only | 1 |
| R4 | Push reliability (invalid tokens, dual registry) | H | M | Field Test devices | Single DeviceInstallation; bounce handling | 4 |
| R5 | Store rejection (deletion, Sign in with Apple, privacy) | M | H | checklist 11 | POLICY decisions before B17; Apple if Google OAuth | 7 |
| R6 | Incomplete account deletion vs Store claims | H | H | legal review | Do not submit until policy+job or honest copy | 7 |
| R7 | Two-client drift (iOS≠Android≠Web product) | H | H | contract fixtures, screen IDs | contracts/ as SoT; no “mobile redesign” | 3 |
| R8 | API contract drift | M | H | OpenAPI snapshot CI | fail CI on undocumented fields | 1 |
| R9 | RTL / Hebrew truncation | M | M | device matrix SE + Samsung | DoD per screen | 5 |
| R10 | Production data safety (destructive tests, cron spoof) | M | H | flavor review; B18 | Isolated tests only; no seed/reset on Prod; CRON_SECRET; M1 Debug uses Prod after gates | 1 |
| R11 | Agent timeout / double Action Gateway | M | H | idempotency tests | keys + ignore client conversation | 3 |
| R12 | Capture upload vs single VPS disk | L | M | ops monitoring | KEEP disk V1; migrate later | 4 |
| R13 | Capacitor leftover confusion | L | M | repo naming | new repo; ignore android/ in Exchange | 0 |
| R14 | Stale Supabase docs → wrong backups | M | H | ops | treat Docker PG as truth | 0 |
| R15 | OAuth bridge leftover used as session | M | H | code review | v1 issues refresh, not cookie | 1 |
