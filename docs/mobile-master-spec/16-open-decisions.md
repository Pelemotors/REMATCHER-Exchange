# 16 — Open Decisions

Do not resolve product/legal questions inside a coding PR.

---

## OPEN PRODUCT DECISIONS

### D-P1 — Sign in with Apple
- **Question:** If Google OAuth remains, Apple requires Sign in with Apple on iOS.
- **Why:** Store rejection.
- **Options:** (a) Apple+Google on Mobile (b) email/password only on Mobile (c) Apple only on iOS, Google on Android.
- **Tradeoffs:** (a) matches existing APIs (b) simpler Store (c) inconsistent.
- **Recommendation:** (a) if Web OAuth stays; otherwise (b) for V1.

### D-P2 — Monetization / IAP at V1 Store
- **Question:** Ship paywall live?
- **Why:** Billing questionnaires, sandbox IAP.
- **Options:** (a) keep monetization off, hide paywall (b) enable IAP.
- **Recommendation:** (a). Preserve `BILL.PAYWALL` behind flag.

### D-P3 — Share-in from WhatsApp in V1
- **Question:** Required for Gate 4?
- **Why:** Web/Capacitor had ShareStaging; native share extensions are heavy.
- **Options:** (a) P3 after Capture camera/gallery (b) Gate 4 must-have.
- **Recommendation:** (a) unless owner says Capture-from-WhatsApp is launch-critical.

### D-P4 — Activity vs Notifications
- **Question:** Is `/activity` a distinct feed from `/api/notifications`?
- **Why:** Web activity page uses notifications API.
- **Options:** (a) alias (b) new AppEvent feed.
- **Recommendation:** (a) for V1.

### D-P5 — Seller `explanationJson` on Mobile
- **Question:** Show ranking internals to seller?
- **Why:** Web GET opportunities includes explanationJson.
- **Options:** (a) preserve (b) strip to privacy-safe whyPotential.
- **Recommendation:** (b) unless product wants full explanation.

### D-P6 — Usable during deletion PENDING
- **Question:** Can the owner keep using the app after request and before confirm?
- **Recommendation:** yes, until confirm.

---

## OPEN LEGAL / POLICY DECISIONS

### D-L1 — Account deletion data classes
- **Question:** For each class in the Phase 3B data map: DELETE / ANONYMIZE / RETAIN?
- **Why:** Store deletion + privacy policy.
- **Recommendation:** draft: delete credentials & media & memory & push; retain legal acceptances & financial records if any; **needs lawyer**.
- **Mark:** **POLICY DECISION REQUIRED**

### D-L2 — OpenAI / plate image processor disclosure
- **Question:** App Privacy / Data Safety wording for vision OCR and Agent.
- **Recommendation:** disclose photos + conversation to “OpenAI as processor”; consent remains Privacy AI gate.
- **POLICY DECISION REQUIRED**

### D-L3 — Retention years
- **Question:** Confirm or replace `getRetentionPolicy()` numbers.
- **POLICY DECISION REQUIRED**

### D-L4 — Play Closed Testing requirements at submission date
- **Question:** 12 testers / 14 days / etc. change over time.
- **Recommendation:** verify against current Play Console policy at Gate 6. UNKNOWN now.

---

## OPEN TECHNICAL DECISIONS

### D-T1 — Access token format
- **Question:** opaque server sessions vs short JWT.
- **Options:** (a) opaque (easy revoke) (b) JWT 15m + `sid` denylist.
- **Recommendation:** (a) opaque access stored hashed, 15m, like refresh but shorter — one table with `kind`.

### D-T2 — OpenAPI sync between repos
- **Options:** (a) snapshot commit in Mobile (b) git submodule (c) publish npm package.
- **Recommendation:** (a).

### D-T3 — iOS minimum / Heebo licensing
- **Recommendation:** iOS 17; embed Heebo if license allows (SIL OFL — usually yes) or system SF Hebrew as fallback **only if** OFL embedding is rejected.

### D-T4 — Android minSdk / Hilt / Retrofit
- **Recommendation:** minSdk 26; no Hilt V1; no Retrofit V1; OkHttp + kotlinx.serialization.

### D-T5 — Bundle ID vs existing Capacitor `co.rematcher.exchange`
- **Question:** Reuse for Store apps?
- **Recommendation:** reuse Production id; Dev/FieldTest suffixes. Confirm Apple team + Play app does not already conflict.

### D-T6 — Web JWT revoke on password reset
- **Question:** Mobile refresh revoke is clear; Web 30d JWT is not.
- **Recommendation:** password `tokenVersion` / `sessionEpoch` on User checked in NextAuth jwt callback — **small Web change**, separate package after B03, not required to *start* Mobile but required before claiming “reset logs out everywhere”.

### D-T7 — Database hosting change
- **Question:** Move Postgres off VPS before Mobile?
- **Recommendation:** **no**. Not a Mobile prerequisite.
