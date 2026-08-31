# Open Product Decisions — REMATCHER Exchange

מעקב אחר החלטות מוצריות פתוחות.  
מקור: [PRD_CORE.md](../PRD_CORE.md) — סעיף 72.

**סטטוס כללי:** CORE MVP IMPLEMENTATION AUTHORIZED — CONTROLLED BUILD  
Product Discovery ממשיך במקביל. OPEN decisions **עדיין פתוחות** — אין להמציא אותן בקוד.  
פרוטocol escalation: [AGENTS.md](../AGENTS.md), PRD §78.

> **היסטוריה:** לפני Controlled Build, סטטוס היה "Product Discovery — לא מוכן ליישום". Authorization ל-Build **לא** סגר אוטומטית את P-01 → P-16.

---

## החלטות פתוחות (P-01 → P-16)

| ID | נושא | תיאור | סטטוס | השפעה על Core Loop | הערות |
|----|------|-------|-------|-------------------|-------|
| P-01 | Minimum Vehicle Dataset | אילו שדות חובה ל-Candidate/Validated Match? | `OPEN` | קובע מתי Match אפשרי; קשור ל-Inference risk | §37 OPEN |
| P-02 | B2B Price Workflow | מתי/איך נדרש מחיר B2B; כמה זמן תקף | `OPEN` | חוסם Validated Match ל-Buyer | §23 STRONG WORKING + OPEN |
| P-03 | Freshness Policy | מה הופך Inventory ל-Fresh/Stale; thresholds | `OPEN` | מפעיל Availability Validation | §21 LOCKED concept + OPEN windows |
| P-04 | Buyer Match Card | שדות אנונימיים מדויקים ל-Buyer | `OPEN` | מה Buyer רואה לפני Interest | §37 WORKING DIRECTION |
| P-05 | Seller Opportunity Card | מידע Demand מvisible ל-Seller | `OPEN` | מה Seller רואה לפני Interest | §41, §43 |
| P-06 | Buyer Budget Exposure | תקציב מדויק / range / relationship only | `OPEN` | משפיע על Seller Opportunity Card | §43 OPEN; hidden max = LOCKED forbidden |
| P-07 | Match Score v1 | Weights ו-Unknown handling | `OPEN` | קובע Strong vs Alternative vs Hidden | §33 LOCKED thresholds; weights OPEN |
| P-08 | Alternative Push | אילו Alternatives (75–89%) מצדיקים Push | `OPEN` | Push timing ו-friction | §51 OPEN |
| P-09 | Dealer Verification | דרישות ותהליך אימות Dealer | `OPEN` | Onboarding; Verified Dealers Only = LOCKED | §53 |
| P-10 | Trust v1 | האם MVP משתמש ב-Trust מעבר ל-Verified | `OPEN` | Ranking פוטנציאלי | §55 WORKING; NOT MVP formula |
| P-11 | Fishing Controls | מדיניות נגד Interested לצורך Reveal בלבד | `OPEN` | Reveal abuse | §57 OPEN |
| P-12 | Inventory Initial Contribution | חובת מלאי מלא ב-Onboarding vs הדרגתי | `OPEN` | Cold Start; Onboarding | §17 OPEN |
| P-13 | Pilot Ready Threshold | מתי מוכנים ל-Pilot | `OPEN` | Go/No-Go לפני פיתוח מלא | §63 |
| P-14 | Pilot Metrics | KPI framework סופי | `OPEN` | מדידת MVP hypothesis | §65 OPEN |
| P-15 | Kill Criteria | תנאים להפסקת Hypothesis | `OPEN` — REQUIRED BEFORE PILOT | מונע Feature Creep | §66 |
| P-16 | Pricing | מחיר Subscription | `OPEN` | Business model | §62 CURRENT DIRECTION |
| P-61 | Exhausted Allowance | Grace Reveal when mutual interest exists; block new connections only | `WORKING DIRECTION` | Grace Reveal proceeds; `ACTION_REQUIRED` on commercial | Pilot: no payment provider yet |

---

## תבנית לסגירת החלטה

כאשר מתקבלת החלטה, העתק את הבлок הבא ומלא:

```markdown
### [P-XX] — [שם ההחלטה]

- **תאריך:** YYYY-MM-DD
- **סטטוס חדש:** LOCKED / REJECTED / WORKING DIRECTION
- **החלטה:** [תיאור מדויק]
- **סיבה:** [למה]
- **PRD לעדכון:** סעיף §__
- **Invariants affected:** I-XX (אם רלוונטי)
- **Walkthrough impact:** [איזה שלב ב-DISCOVERY_WALKTHROUGH מושפע]
```

---

## כללים

1. **אין להמציא החלטה** על פריט `OPEN` — לא בקוד, לא ב-UX, לא ב-schema.
2. כשסוגרים החלטה — עדכן גם את [PRD_CORE.md](../PRD_CORE.md) ואת [DISCOVERY_WALKTHROUGH.md](./DISCOVERY_WALKTHROUGH.md) אם רלוונטי.
3. `WORKING DIRECTION` אינו סגור — אל תקודד כ-requirement סופי בלי אישור.
4. **Controlled Build:** אם implementation חסום — escalate לפי [AGENTS.md](../AGENTS.md) (3 אפשרויות + Recommendation); המשך parallel בעבודה לא חסומה.
