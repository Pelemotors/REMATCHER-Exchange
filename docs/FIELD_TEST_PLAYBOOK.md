# Field Test Playbook — Owner (non-developer)

Goal: verify Inventory Intake on real phones after Field Test is publicly reachable over HTTPS.

## Current engineering status

- Field Test DB + migrations + dealers A/B: ready on the VPS (isolated)
- Intake API + GOV lookup + handoff page `/intake/handoff`: in code
- Android/iOS Share adapter **source**: implemented (staging → deep link)
- **Blocked for phone access until you complete the DNS/TLS step below**
- **Blocked for WhatsApp Share Sheet until Apple Developer + Google Play signing**

---

## Step 0 — Make Field Test reachable from phones (required first)

1. Create DNS A/AAAA record, e.g. `field-test-exchange.rematcher.co.il` → this VPS public IP
2. Add Caddy site (ops) reverse_proxy to `127.0.0.1:3100` with HTTPS
3. Tell engineering the hostname is live (or apply env updates yourself per `docs/FIELD_TEST_ENVIRONMENT.md`)
4. Confirm on phone Safari/Chrome: `https://<hostname>/login` loads

Until Step 0 is done, skip phone tests.

---

## Accounts (Field Test)

| Role | Email |
|------|-------|
| Dealer A | `fieldtest-a@rematcher.local` |
| Dealer B | `fieldtest-b@rematcher.local` |

Password: from seed script / operator handoff (not stored in git). Change after first login if shared.

---

## A. Web intake smoke (phones, after Step 0)

1. Login as Dealer A
2. Open `/intake/handoff`
3. Select several vehicle photos
4. Expect **קיבלנו**
5. Open **המלאי שלי** — vehicle may appear as needing images/review or ready after GOV+media
6. Login as Dealer B — must **not** see A's intake/vehicles

PASS / FAIL: ___

## B. Search-First VNext smoke

1. Home → paste Hebrew search → confirm → My Searches
2. Open search detail — no seller identity / score in UI
3. If matches exist: מתאים לי / לא רלוונטי

PASS / FAIL: ___

## C. WhatsApp Share (after signed mobile builds)

### Android

1. Install signed REMATCHER build from Play testing track
2. Open app once → login as Dealer A → grant permissions
3. WhatsApp → select images (+ text) → Share → REMATCHER
4. Expect durable ACK **קיבלנו** without filling a vehicle form

### iPhone

1. Install via TestFlight
2. Open containing app once → login → permissions
3. WhatsApp → Share → REMATCHER
4. Same ACK expectation

PASS / FAIL Android: ___  
PASS / FAIL iPhone: ___

---

## Owner distribution checklist (when ready for C)

- [ ] Google Play Console access
- [ ] Apple Developer Program membership
- [ ] App IDs + App Group + Share Extension capability
- [ ] Field Test HTTPS URL baked into mobile build (`MOBILE_WEB_URL`)
