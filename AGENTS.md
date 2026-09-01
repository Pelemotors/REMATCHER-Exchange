# AGENTS.md — REMATCHER Exchange

הנחיות ל-Cursor ו-AI coding agents. **קרא לפני כל פעולה בפרויקט.**

## Brand (LOCKED)

- **Parent brand:** REMATCHER
- **Product (user-facing):** REMATCHER Exchange
- **Do NOT use** "Private Dealer Exchange" in UI/copy
- Hebrew terminology: חיפוש, התאמה, מעניין אותי, יש עניין ברכב שלך, עניין הדדי, נוצר חיבור
- See [docs/BRAND_SYSTEM.md](./docs/BRAND_SYSTEM.md)

## Agent Constitution (LOCKED)

> **AI understands. Our system decides.**

Follow the Master Decision Chain in [docs/AGENT_DECISION_CONSTITUTION.md](./docs/AGENT_DECISION_CONSTITUTION.md).

## Commercial Model (LOCKED DIRECTION)

- Billing event = **Reveal created** (not Interest, Validation, Outcome)
- 5 free Reveals per **Dealer**
- See [docs/COMMERCIAL_MODEL.md](./docs/COMMERCIAL_MODEL.md)

## Production QA (LOCKED)

**Canonical production URL for all new QA:** `https://exchange.rematcher.co.il`

- Smoke tests, E2E, visual QA, manual checks → **exchange.rematcher.co.il**
- `https://rematcher-exchange.vercel.app` — deployment/debug only; not the default QA target
- Scripts: default `E2E_BASE_URL` = canonical URL; override only for Vercel troubleshooting

## סטטוס פרויקט

**CORE MVP IMPLEMENTATION AUTHORIZED — CONTROLLED BUILD**

Product Discovery ממשיך במקביל. **OPEN decisions לא נסגרו אוטומטית** — אין להמציא Product Decisions.

---

## מה מותר לבנות

תשתית ומוצר אמיתיים עבור Core Loop:

Auth · Users · Dealer accounts/profiles · Verification baseline · DB · Backend · Frontend · **PWA** · **Web Push** · Inventory + ingestion · Demand + parsing · Matching v1 · Candidate/Validated Matches · Validation · B2B Price · Buyer Match UX · Interested/Reject/No Response · Seller Opportunity · Mutual Interest · Reveal · internal notifications/activity · Outcome · Admin בסיסי

**עקרון:** Real Core MVP with changeable product rules — DB/Backend/Users/Matching/Push אמיתיים; Product Rules שאינן LOCKED — configurable, לא hard-coded.

**UX:** Frontend ו-Core Flow מתפתחים **יחד**. Mobile-first PWA לבדיקות משתמש מוקדמות.

---

## מה עדיין אסור

- Public marketplace · Browse All Inventory · Public ratings
- Auction · Payments · Escrow · Financing · Logistics · Inspection marketplace
- Full CRM · Full inventory-management system
- Native iOS/Android apps
- Negotiation engine · Autonomous sales agent · Advanced BI
- **Product-critical** WhatsApp / Meta / external API dependency
- Feature רק כי "marketplaces usually have it"
- **לבחור default** על נושא `OPEN` ללא Product Decision
- **להמיר** `WORKING DIRECTION` ל-`LOCKED` ללא החלטה מפורשת

---

## DO

1. **קרא [PRD_CORE.md](./PRD_CORE.md)** — §75–79 לפני החלטות build
2. **שמור [Invariants](./docs/INVARIANTS.md)** I-01 עד I-20 — בתוקף מלא
3. **זהה סטטוס:** `LOCKED` / `WORKING DIRECTION` / `OPEN` / `REJECTED`
4. **המשך בparallel** בעבודה שלא חסומה על OPEN
5. **עדכן [OPEN_DECISIONS.md](./docs/OPEN_DECISIONS.md)** כשמתקבלת החלטה
6. **PWA + Web Push** — פלטפורמה ו-Notifications channel: **LOCKED** (§76–77 PRD)

---

## טיפול ב-OPEN Decisions (במהלך Implementation)

כאשר implementation מגיע לנקודה שתלויה ב-`OPEN`:

1. ציין מספר החלטה (e.g. `P-03`)
2. הסבר מה חוסם / משפיע על הפיתוח
3. הצג **3 אפשרויות קונקרטיות**, לכל אחת: יתרון · חסרון · השפעה על UX/Product/Complexity
4. **Recommendation** אחת ברורה
5. **המתן** ל-Product Decision **רק** לנקודה הזו
6. **המשך** במקביל בכל עבודה שלא חסומה

> **Flag the ambiguity. Do not silently decide it in code.**

---

## Integration = Accelerator, not Dependency (LOCKED)

Core Product עובד **ללא** WhatsApp, Meta, CRM, App Store, external inventory API.

Web Push (LOCKED) הוא ערוץ Core — לא WhatsApp.  
WhatsApp/SMS/Email — **Accelerators עתידיים** בלבד.

---

## Push (LOCKED)

- Web Push — חלק מה-Core Product
- Push = מנגנון התרעה; **in-app notifications/activity** = מקור האמת
- Deep link מ-Push למסך/אובייקט הרלוונטי
- Push ל-Commercial Value בלבד (I-14) — לא engagement מלאכותי

---

## מיפוי מסמכים

| סוג שאלה | מסמך |
|----------|------|
| Controlled Build scope / Platform | PRD §75–79 |
| Privacy / Reveal | PRD §8–10, §38–40; Invariants I-02, I-10, I-11, I-19 |
| Matching / Constraints | PRD §27–33 |
| Interested / Validation | PRD §12, §14; I-04, I-18 |
| Push | PRD §48–52, §77; I-14 |
| **Exchange Agent** | `docs/agent/` — Playbook, Privacy, Tools, Language, Golden Conversations |
| OPEN decision | [OPEN_DECISIONS.md](./docs/OPEN_DECISIONS.md) |
| Discovery / gaps | [DISCOVERY_WALKTHROUGH.md](./docs/DISCOVERY_WALKTHROUGH.md) |
| Non-MVP | PRD §67–68 |

---

## דוגמאות — Invariants (תמיד)

| מצב | ❌ אסור | ✅ נכון |
|-----|--------|--------|
| Seller אישר "רכב זמין" | Seller Interested | Validation Event (I-04) |
| Candidate Match | Opportunity ל-Seller | Opportunity אחרי Buyer Interest (I-05) |
| P-03 OPEN | hard-code 7 days | configurable placeholder + escalate P-03 |
| Freshness stale | block silently | Validation Request flow (WORKING DIRECTION) |

---

## היסטוריית סטטוס

| תאריך | סטטוס |
|-------|--------|
| v0.3 | Product Discovery — NOT READY FOR IMPLEMENTATION |
| Controlled Build | CORE MVP IMPLEMENTATION AUTHORIZED — Discovery במקביל |
