# Discovery Walkthrough — Private Dealer Exchange

תבנית לתרגיל Discovery מסעיף 73 ב-[PRD_CORE.md](../PRD_CORE.md).

**סטטוס:** ממשיך **במקביל** ל-Controlled Core MVP Build — לגלות gaps ולסגור החלטות תוך כדי פיתוח ובדיקות משתמש.

**מטרה:** להעביר עסקה דמיונית מקצה לקצה **בלי להמציא כלל באמצע**.

אם בשלב כלשהו כותבים "פה כבר נראה מה נעשה" — יש **Product Decision חסרה**.

---

## תרחיש הבסיס

| צד | פעולה |
|----|-------|
| **Dealer A (Seller)** | מכניס Inventory |
| **Dealer B (Buyer)** | כותב: *"מחפש CX-5 2022 ומעלה, עד 130, לא אדום"* |

---

## שלב 1 — Onboarding & Inventory

- [ ] Dealer A מאומת (Verified) — **P-09 OPEN:** תהליך אימות?
- [ ] Dealer B מאומת — idem
- [ ] **Data קיים:** אילו שדות יש לרכב של A? — **P-01 OPEN**
- [ ] **Ingestion:** Excel / CSV / Paste / Manual — **WORKING DIRECTION** §19
- [ ] **Freshness:** האם הרכב Fresh? — **P-03 OPEN**
- [ ] **B2B Price:** האם יש מחיר B2B או Retail בלבד? — **P-02 OPEN**

**Decision Missing:**
```
[רשום כאן מה חסר]
```

---

## שלב 2 — Demand Creation

- [ ] Dealer B מזין Demand בשפה טבעית — **LOCKED** §24
- [ ] **AI parsing:** מה המערכת מפרקת?
  - Make/Model: Mazda CX-5
  - Year: 2022+
  - Trim: מפואר — Preference
  - Budget: ₪130,000 — Soft (§31)
  - Color: Red — Excluded (Hard?)
- [ ] Dealer B מאשר/עורך structured requirements
- [ ] Demand Lifetime: 3 days default — **LOCKED** §25

**Decision Missing:**
```
[האם "לא אדום" = Hard Exclusion? האם trim "מפואר" = Preference בלבד?]
```

---

## שלב 3 — Matching Engine

- [ ] **Hard vs Soft:** רשימת constraints מסווגת
- [ ] **פסילות:** אילו רכבים נפסלים ולמה?
  - [ ] רכב אדום → MISMATCH
  - [ ] רכב 2021 → MISMATCH (year Hard?)
  - [ ] רכב מעל ₪143K (>10%) → Hidden by default
- [ ] **Unknown handling:** שדות חסרים → UNKNOWN, לא Match — **LOCKED** §30
- [ ] **Candidate Match** נוצר לרכב של A?
- [ ] **Score:** Strong (90+) / Alternative (75–89) / Hidden (<75) — **LOCKED** §33
- [ ] **Weights:** — **P-07 OPEN**

**Decision Missing:**
```
[Score calculation; Unknown fields on A's vehicle]
```

---

## שלב 4 — Validation (if required)

- [ ] האם נדרש **Availability Validation**? (Freshness) — **P-03 OPEN**
- [ ] Seller מקבל: "הרכב עדיין זמין?" — **VALIDATION**, לא INTEREST — **LOCKED** §22, I-04
- [ ] האם נדרש **B2B Price Validation**? — **P-02 OPEN**
- [ ] Seller מספק/מאשר B2B price
- [ ] **Validated Match** מוכן ל-Buyer

**Decision Missing:**
```
[Trigger conditions for each validation type]
```

---

## שלב 5 — Buyer Match Card

- [ ] Dealer B מקבל Push — **LOCKED** §48 (Commercial Value)
- [ ] **מה Buyer רואה:** — **P-04 OPEN**
  - [ ] Make, Model, Year, Trim, Mileage, Color, Region
  - [ ] B2B Price
  - [ ] Match quality (לא 93% — **WORKING DIRECTION** §34)
  - [ ] Gaps (e.g. "מחיר — מעט גבוה")
  - [ ] Verified Dealer indication
- [ ] **מה Buyer לא רואה:** — **LOCKED** §39
  - [ ] Dealer name, phone, VIN, exact address
  - [ ] Seller floor, MOVE, liquidity
  - [ ] תמונות מקוריות — **LOCKED** §38
- [ ] **Inference check:** האם שילוב השדות חושף את A? — **I-19**

**Decision Missing:**
```
[Exact field list; region granularity]
```

---

## שלב 6 — Buyer Response

- [ ] Dealer B: **Interested / Reject / No Response** — **LOCKED** §44
- [ ] אם Interested → semantics: non-binding exposure intent — **LOCKED** §12, I-18
- [ ] אם Reject → reject reasons? — **OPEN** §45 (MVP required?)
- [ ] NO_RESPONSE ≠ REJECTED — **I-12**

**Decision Missing:**
```
[Reject reasons in MVP?]
```

---

## שלב 7 — Seller Opportunity

- [ ] **Opportunity** נוצר (Match ≠ Opportunity עד Buyer Interest) — **I-05**
- [ ] **מה Seller רואה:** — **P-05 OPEN**
  - [ ] Demand summary (CX-5, 2022+, trim preference)
  - [ ] Budget relationship — **P-06 OPEN**
  - [ ] Own vehicle + B2B price
  - [ ] Match quality + gaps
- [ ] **מה Seller לא רואה:**
  - [ ] Buyer identity — **LOCKED** §42
  - [ ] Hidden max, inferred flexibility — **LOCKED** §43
- [ ] Seller: **Interested / Not Relevant / No Response**

**Decision Missing:**
```
[Budget visibility format to Seller]
```

---

## שלב 8 — Mutual Interest & Reveal

- [ ] Buyer Interested + Seller Interested → **Mutual Interest** — **LOCKED** §9
- [ ] **Reveal:** אילו פרטי קשר נחשפים? — Reveal Policy (פרטים: OPEN)
- [ ] One-sided Interest never caused Reveal — **I-03**

**Decision Missing:**
```
[Exact Reveal fields: name, phone, business?]
```

---

## שלב 9 — Post-Reveal

- [ ] הצדדים ממשיכים **מחוץ לפלטפורמה** — **LOCKED** §10, I-17
- [ ] **Outcome requested:** Deal closed / Price didn't work / etc. — §61
- [ ] Outcome ≠ Verified Truth; לשימוש Learning

**Decision Missing:**
```
[Outcome options in MVP; timing of request]
```

---

## סיכום Gaps

| שלב | Decision Missing | PRD Ref | Priority |
|-----|------------------|---------|----------|
| 1 | | P-01, P-02, P-03, P-09 | |
| 2 | | §27–28 | |
| 3 | | P-07 | |
| 4 | | P-02, P-03 | |
| 5 | | P-04 | |
| 6 | | §45 | |
| 7 | | P-05, P-06 | |
| 8 | | Reveal Policy | |
| 9 | | §61 | |

**Walkthrough Status:** ☐ Not Started | ☐ In Progress | ☐ Complete (zero invented rules)

---

## הוראות שימוש

1. מלא כל שלב בצוות Product — לא בקוד.
2. כל "Decision Missing" → הוסף ל-[OPEN_DECISIONS.md](./OPEN_DECISIONS.md) אם עדיין לא שם.
3. רק כש-**Walkthrough Status = Complete** — שקול Authorization לפיתוח.
