# 12 — Testing, QA, Observability, Devices

## Pyramid

### Backend (Exchange repo)

| Layer | What |
|---|---|
| Unit | matching, privacy-views, error mapper, token hash |
| Integration | Prisma mocked or dedicated isolated DB — **never Production** |
| Authorization | matrix in 04 — **real DB, two dealers** |
| Contract | OpenAPI snapshot vs route responses; golden JSON for match DTO (no seller fields) |

Must exist before Gate 1: A≠B, revoke refresh, suspended, device revoke ownership, media ownership.

### iOS

Unit ViewModels; `URLProtocol` stubs; UITest login + tab smoke; Universal Link fixture; auth refresh race.

### Android

Unit ViewModels; fake ApiClient; Compose UI; intent App Link; Encrypted prefs round-trip.

### Contract

`contracts/api/error-codes.json` + golden match/opportunity fixtures committed. CI fails if Android/iOS enums drift (script in Mobile repo).

---

## Offline / network (not offline-first)

| Action | Retry |
|---|---|
| GET lists | yes, exponential 3× |
| Interest / validation / reveal outcome / demand confirm / inventory create / agent write | **only with Idempotency-Key**, user-visible |
| Capture media | user-visible; unknown → new object |
| Login | user-visible |

Background/foreground: refresh access; do not duplicate interest.

Expired session mid-flow: refresh; if fail, save nothing, return to login with callback.

---

## Observability

- `X-Request-Id` on every v1 call; show truncated id on fatal error (no PII).
- Client headers: platform, version, build, env.
- Server logs correlate requestId → service → action.
- Crash SDK: **not** in foundation. Revisit Gate 5.

---

## Device matrix (emulators insufficient)

**iOS**

- Current iPhone (e.g. 16 / latest)
- Small: iPhone SE 3rd
- Oldest supported OS of the chosen min (recommend iOS 17)

**Android**

- Pixel current
- Samsung One UI class (A-series or S)
- Small/older API of minSdk (recommend 26 or 29 — **open technical**)

On each: push, camera/gallery, keyboard+RTL, background, deep link, airplane mode, login refresh, capture upload, Hebrew Dynamic Type.

---

## RTL QA (every product package)

Checklist in 07. Gate 5 cannot pass with English-only screenshots.
