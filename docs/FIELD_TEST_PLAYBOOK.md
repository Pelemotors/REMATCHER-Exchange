# Field Test Playbook — Owner (non-developer)

Goal: use REMATCHER Exchange on a phone as a real dealer against the Field Test stack.

## Current status (RC)

| Item | Status |
|------|--------|
| Public HTTPS `https://field-test-exchange.rematcher.co.il` | PASS (DNS + Caddy + LE) |
| Isolated DB/media on VPS | PASS |
| Owner web login (Gmail Field-Test account) | READY — use operator handoff password |
| Android signed APK (direct HTTPS, no Play) | READY — see `docs/ANDROID_FIELD_TEST_INSTALL.md` |
| iOS TestFlight / Apple signing | ACTION REQUIRED — see `docs/IOS_TESTFLIGHT_OWNER_ACTIONS.md` |

DNS/Caddy setup is **done**. Do not treat DNS as Owner-blocked unless the hostname stops resolving.

---

## Accounts (Field Test)

| Role | Email |
|------|-------|
| Owner / Dealer A | `galsamama@gmail.com` |
| Counterparty / Dealer B | `fieldtest-b@rematcher.local` |

Passwords: operator handoff only (not in git).

---

## A. Web smoke (phone browser)

1. Open `https://field-test-exchange.rematcher.co.il/login`
2. Login as Owner
3. Home → Search → My Searches → Inventory → Intake (`/intake/handoff`) → Review (`/intake/review`)
4. Share-like text + photos on handoff → wait for “קיבלנו” only after ACK
5. If Review appears: fill **only** what is missing (plate / confirm duplicate / media category) — then continue

---

## B. Android WhatsApp Share (no Google Play)

1. Install the Field-Test APK from the HTTPS link in `docs/ANDROID_FIELD_TEST_INSTALL.md` (Install from this source once)
2. From WhatsApp: Share image(s)+text → REMATCHER Exchange
3. Complete login if needed; confirm upload ACK; local staging cleans up after durable ACK

---

## C. iOS

Requires Apple Developer + TestFlight. Exact Owner steps: `docs/IOS_TESTFLIGHT_OWNER_ACTIONS.md`.

---

## Isolation reminder

Field Test never writes Production DB/media. Same product code/schema; separate database and storage root only.
