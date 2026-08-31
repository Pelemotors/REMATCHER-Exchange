# PRD CORE v0.3 — PRIVATE DEALER EXCHANGE

**Status:** Controlled Core MVP Build (Product Discovery continues in parallel)
**Document Role:** Product Source of Truth
**Development Status:** CORE MVP IMPLEMENTATION AUTHORIZED — CONTROLLED BUILD
**Audience:** Product, Founder, Cursor / AI Coding Agents, future engineering team

> **Status History:** v0.3 was Product Discovery / NOT READY FOR IMPLEMENTATION. Controlled Core MVP Build authorized — see §75–79.

---

# 1. מטרת המסמך

מסמך זה מגדיר את גרעין המוצר של **Private Dealer Exchange**.
מטרתו לשמר באופן חד־משמעי:

* מה המוצר.
* איזו בעיה הוא פותר.
* כיצד ה־Core Loop אמור לעבוד.
* אילו התנהגויות מערכת כבר הוחלטו.
* אילו גבולות אסור למערכת לחצות.
* מהו מידע פרטי.
* מהם ה־States העסקיים המרכזיים.
* אילו החלטות עדיין פתוחות.
* מה אינו חלק מה־MVP.

המסמך נועד גם לשמש Context ל־AI coding agents.

### הוראה קריטית לכל AI Agent

> **Core MVP Implementation מורשה — Controlled Build.** לא כל החלטה OPEN נסגרה; **אין להמציא Product Decisions.**

כאשר נושא מסומן `OPEN`, אין לבחור default או להפוך אותו לדרישת מערכת סופית.
כאשר נושא מסומן `WORKING DIRECTION` או `EXPLORED`, אין להפוך אותו ל-`LOCKED` ללא החלטה מפורשת.
כאשר חסרה החלטה מוצרית:

> **Flag the ambiguity. Do not silently decide it in code.** — ראה §78 לפרוטocol escalation.

---

# 2. Product Vision

Private Dealer Exchange היא:

> **רשת B2B פרטית לסוחרי רכב שמחברת באופן אוטומטי בין מלאי קיים לבין ביקוש פעיל, מבלי להפוך את המלאי או הביקוש לשוק ציבורי.**

המערכת מחזיקה מידע על:

**Inventory**
ו־
**Demand**

ומחפשת ברקע:

**Potential Deal Opportunities**

הסוחר אינו אמור לעבור על לוח רכבים.

> **הסוחר לא מחפש ברשת — הרשת מחפשת עבורו.**

---

# 3. North Star

בטווח הארוך המוצר שואף להפוך ל:

> **שכבת הנזילות הפרטית של שוק סוחרי הרכב.**

ההתנהגות הרצויה:

לקוח מבקש מסוחר רכב שאין לו:

> "אני מכניס את החיפוש לרשת."

סוחר מקבל Trade-in שאינו רוצה:

> "נבדוק אם יש עליו ביקוש ברשת."

סוחר מחזיק רכב:

> המערכת כבר יודעת עליו ובודקת ברקע האם Dealer אחר מחפש אותו.

המוצר אינו אמור להפוך למקום שבו הסוחר מבלה את היום.

המודל:

**Data sits → Engine works → Commercial event occurs → Push → Dealer acts → Exit.**

---

# 4. Strategic Product Constraint

המוצר נולד בין היתר בעקבות תלות של מוצרים קודמים בפלטפורמות חיצוניות.
לכן:

## LOCKED

> **Integration = Accelerator, not Dependency.**

ה־Core Product חייב לעבוד ללא תלות קיומית ב:

* WhatsApp
* Meta
* Dealer inventory API
* finance company API
* external marketplace
* third-party CRM
* App Store
* Google Play

אינטגרציות עתידיות יכולות לשפר את המוצר.
היעלמותן לא יכולה להרוס את Core Value.

---

# 5. Core Market Problem

בכל רגע עשוי להתקיים:

**Dealer A** מחזיק רכב X.
**Dealer B** מחפש רכב X.

אבל A אינו יודע ש־B מחפש.
ו־B אינו יודע ש־A מחזיק.

המידע כיום מפוזר בין:

* Dealer inventories
* WhatsApp groups
* CRM
* spreadsheets
* phone calls
* personal relationships
* memory

כתוצאה מכך:

> **עסקאות אפשריות אינן מתרחשות משום שהצדדים אינם יודעים זה על זה.**

Private Dealer Exchange נועד לפתור את בעיית ה־Discovery הזו.

---

# 6. Core Product Model

המודל הרעיוני הוא:

> **Inventory × Demand × Liquidity → Deal Opportunity**

### Inventory

רכבים של Dealers ברשת שיכולים עקרונית להשתתף במסחר.

### Demand

בקשה פעילה של Dealer לרכב.

### Liquidity

הנכונות המעשית לבצע עסקה סביב Inventory מסוים.

---

# 7. Product Type

Private Dealer Exchange **אינו Public Marketplace**.

## LOCKED

אין:

**Browse All Inventory**

Dealer אינו יכול:

* לעבור על מלאי של Dealer אחר.
* לחפש באופן חופשי את כל הרשת.
* לצפות בכל המחירים.
* ללמוד מי מחזיק מה.
* לראות מי מחפש מה.

המערכת יכולה לדעת את כל אלה.
המשתמש לא.

---

# 8. Privacy Model

Privacy אינה Feature.
היא חלק מה־Product Value Proposition.

המערכת פועלת כ־**Private Exchange / Dark Marketplace**.
היא רשאית להשתמש במידע פרטי כדי לבצע Matching.
היא אינה רשאית לחשוף אותו אלא בהתאם ל־Reveal Rules.

---

# 9. Identity Rule

## LOCKED

זהות Dealer מוסתרת עד:

**Mutual Interest**

Flow:

**Match**
→ Buyer Interested
→ Seller Opportunity
→ Seller Interested
→ Mutual Interest
→ Reveal

### One-sided Interest MUST NOT reveal identity.

---

# 10. Reveal

כאשר נוצר Mutual Interest, שני הצדדים יכולים לקבל את פרטי הקשר הנדרשים כדי להמשיך ישירות.

לאחר Reveal:

> **Private Dealer Exchange אינה מנסה לשלוט בדרך שבה העסקה מתקדמת.**

הצדדים יכולים:

* להתקשר.
* לשלוח WhatsApp.
* לשלוח תמונות.
* לשלוח סרטונים.
* להעביר VIN.
* להעביר רישיון.
* לשלוח בדיקה.
* להתמקח.
* להיפגש.
* לסגור עסקה.
* לא לסגור עסקה.

אין חובה לעשות זאת בתוך המוצר.

---

# 11. Product Responsibility Boundary

Private Dealer Exchange אחראית בעיקר ל:

> **Discovery → Matching → Mutual Interest → Connection**

היא אינה, ב־MVP:

* צד לעסקה.
* Escrow.
* Vehicle inspector.
* guarantor.
* financing provider.
* payment processor.
* logistics provider.
* dispute resolution service.

---

# 12. Interested Semantics

## LOCKED

`Interested` פירושו:

> **אני מעוניין להיחשף לצד השני ולבדוק אפשרות לעסקה.**

Interested אינו:

* התחייבות לקנייה.
* התחייבות למכירה.
* אישור מחיר סופי.
* אישור מצב הרכב.
* חוזה.
* Offer binding.

יש לשמור על semantics זה בכל UI ובכל future implementation.

---

# 13. Core Business States

יש להבחין בין המושגים הבאים.

## Candidate Match

ה־Matching Engine זיהה התאמה אפשרית.
ייתכן שעדיין חסר:

* Availability validation.
* B2B price.
* Freshness.
* information required to validate match.

Candidate Match אינו בהכרח User-facing.

---

## Validated Match

Candidate שעבר את ה־Validation הנדרש כדי שהמערכת תהיה מוכנה להציג אותו ל־Buyer.

---

## Buyer Interest

Buyer ראה Validated Match והביע Interest.

---

## Opportunity

Buyer Interest הפך את ההתאמה לאירוע מסחרי עבור Seller.

> Algorithmic Match ≠ Opportunity.

---

## Seller Interest

Seller ראה Opportunity והביע Interest.

---

## Mutual Interest

Buyer Interested + Seller Interested.
Mutual Interest הוא Trigger ל־Reveal.

---

## Reveal

זהויות ופרטי קשר נחשפים בהתאם ל־Reveal Policy.

---

## Outcome

מידע אופציונלי/מבוקש לגבי מה שקרה לאחר Reveal.

---

# 14. Validation ≠ Interest

## LOCKED

זהו System Invariant.

אם Seller אישר:

> הרכב עדיין זמין.

אין להסיק:

> Seller Interested.

אם Seller סיפק B2B Price:

אין להסיק:

> Seller Interested.

אלה **Validation Events בלבד**.
Seller Interest נוצר רק כאשר Seller מקבל Opportunity ובוחר להתקדם.

---

# 15. Working Core Loop

ה־Flow הנוכחי:

**Dealer joins**
↓
**Dealer verified**
↓
**Inventory enters network**
↓
**Demand created**
↓
**Candidate Matching**
↓
אם נדרש:
**Availability Validation**
↓
אם נדרש:
**B2B Price Validation**
↓
**Final Match Evaluation**
↓
**Validated Match**
↓
**Buyer receives anonymous Match**
↓
**Buyer Interested / Reject / No Response**
↓
אם Interested:
**Seller receives anonymous Opportunity**
↓
**Seller Interested / Reject / No Response**
↓
אם Seller Interested:
**Mutual Interest**
↓
**Reveal**
↓
**Parties continue independently**
↓
**Outcome requested**
↓
**Feedback may improve Trust / Matching**

### STATUS

`WORKING DIRECTION`
אין לראות ב־Flow זה Specification סופי לפיתוח.

---

# 16. Inventory Principle

## LOCKED

יעד המוצר הוא:

> **כל Inventory רלוונטי יכול עקרונית להשתתף ב־Matching.**

המוצר אינו מבוסס רק על:

> "רכבים שאני רוצה להעיף."

הסיבה:
כמעט כל רכב עשוי להפוך ל־B2B Opportunity כאשר קיימים Buyer, Timing ו־Price מתאימים.

---

# 17. Full Inventory ≠ Mandatory Day-One Upload

## OPEN

טרם הוחלט האם Dealer חייב להכניס את כל המלאי בזמן Onboarding.

אפשרי:

**Partial Inventory → Value → Trust → More Inventory**

אין להמציא Minimum Inventory Requirement לפני שהנושא נסגר.

---

# 18. Inventory Maintenance Principle

## LOCKED

Private Dealer Exchange אינה אמורה להפוך למערכת מלאי נוספת שה־Dealer צריך לנהל.

יש למזער:

* duplicate entry.
* manual updates.
* repeated forms.
* vehicle-by-vehicle maintenance.

המערכת צריכה לעשות ככל האפשר את עבודת:

* normalization.
* comparison.
* inference where safe.
* prompting only when commercially relevant.

---

# 19. Inventory Ingestion

## WORKING DIRECTION

מקורות אפשריים ל־MVP:

* Excel.
* CSV.
* Paste.
* Manual entry.

המערכת יכולה לנרמל Input.
לדוגמה:

> קיה ספורטז 22 אורבן 1.6 62 אלף יד1 119900

עשוי להפוך ל־structured vehicle data.

### Critical rule

AI יכול לנרמל מידע שניתן.
AI אינו רשאי להמציא מידע שלא ניתן.

---

# 20. Inventory Diff

## WORKING DIRECTION

Dealer יכול להעלות מחדש את קובץ המלאי שבו הוא ממילא משתמש.
המערכת משווה:

**Previous Inventory ↔ New Inventory**

ומזהה:

* Added
* Removed
* Changed
* Unchanged

לדוגמה:

> 6 נוספו
> 4 ירדו
> 59 ללא שינוי

Dealer מאשר.
טרם ננעל שזה מנגנון הסנכרון המרכזי.

---

# 21. Freshness

## LOCKED

Inventory חייב להחזיק Freshness concept.
Stale vehicle information אינו יכול להיחשב שווה ערך למידע שאומת לאחרונה.

## OPEN

Freshness windows המדויקים.
אין לקודד כרגע:

* 3 days.
* 7 days.
* 14 days.

או כל threshold אחר כאילו הוחלט.

---

# 22. Just-in-Time Availability Validation

## STRONG WORKING DIRECTION

כאשר Candidate Match נוצר לרכב שאינו Fresh מספיק:
Seller יכול לקבל:

> נמצא ביקוש רלוונטי לרכב שלך.
> הרכב עדיין זמין?

**כן / נמכר**

רק לאחר validation ניתן להתקדם בהתאם לחוקי המערכת.
הפעולה היא:

`VALIDATION`
לא:

`INTEREST`.

---

# 23. B2B Price

Inventory עשוי להיכנס עם Retail Price בלבד.

## STRONG WORKING DIRECTION

אין חובה לדרוש B2B Price לכל Inventory בזמן ingestion.
אבל:

> **Validated Buyer Match לא אמור להישלח ללא מחיר B2B תקף.**

לכן ניתן לבצע:

Candidate Match
→ ask Seller for current B2B price
→ recalculate Match
→ if valid, expose to Buyer.

### עדיין OPEN

ה־B2B Price workflow הסופי.

---

# 24. Demand Creation

## LOCKED

Demand נוצר בשפה טבעית.
לדוגמה:

> צריך CX5 מ־22 ומעלה, עדיפות מפואר, עד 130, לא אדום.

המערכת מפרקת אותו ל־structured requirements ומבקשת אישור.
לדוגמה:

**Mazda CX-5**
2022+
High trim — Preference
Budget: ₪130,000
Red — Excluded

Dealer מאשר או עורך.

---

# 25. Demand Lifetime

## LOCKED

Default Demand Lifetime:

> **3 days**

לאחר מכן ניתן לשאול:

> עדיין מחפש?

אם Dealer מחדש — Demand ממשיך.
אם לא:
Demand מפסיק להשתתף ב־Matching.

---

# 26. Demand Intent

## CURRENT DIRECTION

לא דורשים כרגע הבחנה בין:

* customer demand.
* inventory acquisition demand.

אלא אם יוכח שהמידע משנה Matching או Product Behavior בצורה משמעותית.

---

# 27. Constraint Model

Demand requirements מתחלקים לפחות ל:

### Hard Constraint

אסור ל־Match לשבור אותו.

### Preference

יכול להוריד Match Quality אבל אינו פוסל בהכרח.

---

# 28. Hard Constraint Rule

## LOCKED

Hard Constraint מפורש אינו יכול להישבר בגלל Score גבוה.
לדוגמה:

> חייב 7 מקומות.

רכב עם 5 מושבים:

`INVALID MATCH`

גם אם כל שאר הנתונים מתאימים.

---

# 29. AI Constraint Guardrail

## LOCKED

AI אינו רשאי להמציא Hard Constraint.
לדוגמה:

Dealer:

> "מחפש Kodiaq 2022 עד 150."

אין להסיק אוטומטית:

> 7 seats = mandatory.

Knowledge about the vehicle category may assist normalization.
It must not invent user intent.

---

# 30. Unknown Data Model

## LOCKED

כאשר מידע חסר:

> **Unknown ≠ Match**
וגם:
> **Unknown ≠ Mismatch**

Matching logic חייב להיות מסוגל רעיונית להבחין בין:

1. `MATCH`
2. `MISMATCH`
3. `UNKNOWN`

אסור ל־AI להשלים נתון חסר כדי להעלות Match Score.

---

# 31. Budget Rule

## LOCKED

Budget הוא Soft Constraint כברירת מחדל.
Vehicle עד **10% מעל התקציב** יכול להופיע כ־Alternative Match.
לדוגמה:

Budget:
₪100,000
Vehicle:
₪107,000
יכול להשתתף.
אבל אינו יכול לקבל Strong Match של 90%+ בגלל החריגה.

מעל 10%:
לא מוצג כברירת מחדל.

---

# 32. Price Gap Communication

## LOCKED

כאשר קיימת חריגה מותרת:
המסר הוא ניטרלי:

> **המחיר גבוה מעט ממה שהוגדר בחיפוש.**

אסור לומר:

> Seller flexible.
> Buyer can probably pay more.
> Seller wants to move it.
> Try offering less.
> Buyer usually exceeds budget.

Private information יכול לשמש את המנוע.
לא לשמש מניפולציה בין הצדדים.

---

# 33. Matching Thresholds

## LOCKED — CURRENT PRODUCT RULE

Internal Matching thresholds:

### 90–100

Strong Match.

### 75–89

Relevant Alternative.

### <75

Hidden.

אם אין Strong Match:
ניתן להציג עד:

> **3 Relevant Alternatives**

אין להציג עשרות תוצאות.

---

# 34. Match Score Presentation

## STRONG WORKING DIRECTION

Match Score מספרי משמש בעיקר:

> **Internal Engine Signal**

User-facing UI אינו חייב להציג:

> 93%

במקום זאת אפשר להציג:

### התאמה גבוהה

או:

### התאמה טובה עם פער

ומתחת:

> שנתון — מתאים
> גרסה — מתאים
> ק"מ — מתאים
> מחיר — מעט גבוה

### Rationale

מספר מדויק עלול לייצר False Precision.

### STATUS

טרם LOCKED סופית.

---

# 35. Explainability

## STRONG WORKING DIRECTION

Dealer צריך להבין:

> **למה המערכת חושבת שהרכב רלוונטי?**

ובעיקר:

> **איפה הפער?**

Matching אינו Black Box מבחינת ההחלטה המסחרית.
אין צורך להסביר את האלגוריתם.
כן צריך להסביר את ההבדלים המשמעותיים.

---

# 36. Buyer Match Card — Purpose

## LOCKED PRINCIPLE

Buyer Match Card אינו Listing.
מטרתו אינה לאפשר Buyer להחליט:

> "אני קונה את הרכב."

מטרתו:

> **לאפשר Buyer להחליט אם הוא מוכן להביע Interest ולהיחשף ל־Seller במקרה של Mutual Interest.**

זו הבחנה מרכזית.

---

# 37. Buyer Match Card — Information

## WORKING DIRECTION

מידע שעשוי להופיע:

* Make.
* Model.
* Trim/version.
* Year.
* Mileage.
* Ownership/hand.
* ownership type where relevant.
* Color.
* General region.
* B2B Price.
* critical condition information if available.
* match quality.
* important gaps.
* Verified Dealer indication.

### OPEN

Minimum Vehicle Dataset המדויק.

---

# 38. Images Before Reveal

## LOCKED

> **אין צורך בתמונות מקוריות לפני Reveal ב־MVP.**

הסיבה אינה רק טכנית.
תמונה יכולה לחשוף:

* dealership.
* lot.
* signage.
* license plate.
* location.
* recognizable environment.

בנוסף:
Buyer אינו נדרש להחליט על רכישה לפני Reveal.
הוא רק מחליט האם שווה לפתוח שיחה.

לאחר Reveal הצדדים יכולים להעביר כמה תמונות/סרטונים שירצו.

---

# 39. Sensitive Information Before Reveal

## LOCKED

לפני Reveal אין להציג:

* Dealer name.
* contact person.
* phone.
* exact address.
* VIN.
* seller floor.
* hidden buyer max.
* MOVE.
* liquidity status.
* private flexibility.
* inventory age if commercially sensitive.
* information whose primary effect is identifying the counterparty.

---

# 40. Information Leakage Principle

## LOCKED

Privacy review אינו מסתיים בשאלה:

> "האם הצגנו שם?"

יש לשאול:

> **מה המשתמש יכול להסיק משילוב המידע?**

לדוגמה:
Rare vehicle + exact city + identifiable mileage
עשוי לחשוף Dealer גם ללא שם.

כל future UI צריך להיבחן גם מול inference attacks.

---

# 41. Seller Opportunity Card

Seller כבר יודע מהו הרכב שלו.
לכן Seller Opportunity Card צריך להתמקד ב:

> **Demand + relationship between Demand and Seller's vehicle.**

לדוגמה:

**מחפשים Mazda CX-5**
2022+
High trim preferred
Budget relationship
Your vehicle:
2023 · Premium · 61K km
Your B2B price:
₪134K
**התאמה גבוהה**
פער:

> המחיר מעט גבוה מהחיפוש.

Seller יכול לבחור:

**Interested / Not Relevant**

---

# 42. Seller Opportunity Privacy

## LOCKED

Seller אינו מקבל Buyer identity לפני Mutual Interest.
גם כאשר Buyer כבר Interested.
ניתן לומר:

> **סוחר מאומת ברשת הביע עניין ברכב שלך.**

לא:

> Dealer X מחפש את הרכב.

---

# 43. Budget Visibility to Seller

## OPEN

טרם הוחלט האם Seller יראה:

* exact buyer stated budget.
* range.
* relationship only.
* another representation.

### LOCKED

Seller לעולם אינו מקבל:

* hidden maximum.
* inferred willingness to pay more.
* private Buyer flexibility.

---

# 44. Response States

## LOCKED

יש להבחין בין:

### Interested

Explicit positive action.

### Rejected / Not Relevant

Explicit negative action.

### No Response

No explicit decision.

`NO_RESPONSE` אינו `REJECTED`.
אין ללמוד ממנו אוטומטית שה־Dealer אינו מעוניין.

---

# 45. Reject Reasons

## WORKING DIRECTION

כאשר Dealer דוחה Match/Opportunity ניתן לאפשר Tap אחד:

* Price.
* Year.
* Mileage.
* Trim.
* Condition.
* Not available.
* Other.

אין לחייב טקסט.
המטרה:

* Matching validation.
* preference learning.
* product learning.
* failure analysis.

### OPEN

האם נדרש ב־MVP ואיך לא ליצור Friction.

---

# 46. Learning Guardrail

## LOCKED

Behavioral Learning יכול לשפר:

* Ranking.
* relevance.
* ordering.
* recommendation confidence.

אבל:

> **Behavioral Learning אינו רשאי לשנות Hard Constraint מפורש בשקט.**

Explicit user instruction > inferred preference.

---

# 47. Private Data Use Rule

## LOCKED — SYSTEM CONSTITUTION

> **The system may use private information to determine whether a Match should exist or how it should rank. It may not expose, paraphrase, hint at, or weaponize that private information to persuade the counterparty.**

דוגמה:
Seller privately marked vehicle `MOVE`.
Allowed:

* Engine may prioritize it among otherwise relevant vehicles.

Forbidden:

> "המוכר לחוץ על הרכב."
> "יש סיכוי טוב להוריד אותו."

---

# 48. Push Principle

## LOCKED

Push הוא חלק מה־Core Product.
Dealer אינו אמור לפתוח את המערכת שוב ושוב כדי לבדוק אם קרה משהו.

---

# 49. Push Value Rule

## LOCKED

Push צריך להיות:

> **Signal of Commercial Value**

לא שולחים Push כדי לייצר Engagement מלאכותי.
לא:

> נוספו 17 רכבים.
> בוא לבדוק מה חדש.

כן, עקרונית:

> נמצאה התאמה חזקה לחיפוש שלך.
> סוחר הביע עניין ברכב שלך.
> נדרש אימות כדי להתקדם עם ביקוש לרכב שלך.

---

# 50. Push Types

Potential internal categories:

* `VALIDATION`
* `BUYER_MATCH`
* `SELLER_OPPORTUNITY`
* `MUTUAL_INTEREST`
* `DEMAND_EXPIRY`
* `FRESHNESS`

לא כל Event חייב לייצר Push.

---

# 51. Alternative Push

## OPEN

90%+ הוא מועמד טבעי ל־Push.
75–89% עדיין לא סגור.
אסור לקודד threshold נוסף כגון 85% לפני Product Decision.

---

# 52. Engagement Philosophy

## LOCKED

Success אינו:

* session duration.
* daily screen time.
* feed consumption.

Ideal behavior:

**Push → Decision → Exit**

המוצר צריך לייצר ערך בזמן שהמשתמש אינו בתוכו.

---

# 53. Dealer Verification

## LOCKED CONCEPT

> **Verified Dealers Only**

הרשת אינה פתוחה לציבור הרחב.

### OPEN

Verification policy המדויקת.
ייתכן שתכלול:

* registered business.
* identity.
* phone.
* business information.
* manual review.
* dealer license where relevant.

אין להמציא requirements לפני החלטה.

---

# 54. Trust

## LOCKED PRINCIPLE

Trust הוא Network Asset.
False information מצד Dealer אחד יכול לפגוע באמון במוצר כולו.

---

# 55. Trust Score

## WORKING DIRECTION

Internal Trust עשוי בעתיד לקחת בחשבון:

* inventory accuracy.
* availability accuracy.
* price stability.
* response behavior.
* cancellations.
* post-Reveal behavior.
* reports.
* outcomes.

Trust עשוי להשפיע על Ranking.

### NOT MVP DECISION

אין עדיין formula.

---

# 56. Public Ratings

## REJECTED FOR CURRENT MVP

אין:

⭐⭐⭐⭐⭐
Public dealer-rating marketplace.

Trust מיועד בעיקר לשימוש פנימי.
User-facing indication אפשרית:

> Verified Dealer

ואולי בעתיד qualitative trust indicator.

---

# 57. Fishing

System Threat:
Dealer יכול ללחוץ Interested רק כדי לבצע Reveal וללמוד מי מחזיק רכב.

Potential signals:

* unusually high Interest rate.
* many Reveals.
* low progression.
* repeated suspicious behavior.

## OPEN

Enforcement policy.
אין לחסום משתמשים על בסיס heuristic שלא הוגדר.

---

# 58. Fake Liquidity

Full Inventory אינו בהכרח Liquid Inventory.
Dealer יכול להחזיק 200 רכבים אך בפועל לסרב לכל B2B Opportunity.

זו בעיית Product/Network אמיתית.

Potential future signals:

* response.
* B2B pricing.
* seller interest.
* outcomes.
* MOVE.
* historical behavior.

## OPEN

Tradability model.

---

# 59. Fake Pricing

Repeated behavior שבו Seller מאשר מחיר ואז משנה אותו לאחר Buyer Interest עלול לפגוע ב־Trust.

## WORKING DIRECTION

Repeated material price inconsistency may affect internal Trust.
Exact policy:

`OPEN`.

---

# 60. Dealer Group Dominance

Dealer Group גדול יכול להחזיק אלפי רכבים ולהופיע כמעט בכל Demand.
Matching בעתיד עשוי לקחת בחשבון:

* relevance.
* price.
* freshness.
* trust.
* diversity.

## OPEN

אין Diversity algorithm סגור.

---

# 61. Outcome

לאחר Reveal ניתן לבקש:

> מה קרה עם ההתאמה?

אפשרויות אפשריות:

* Deal closed.
* Price didn't work.
* Vehicle didn't fit.
* Did not progress.
* Still in progress.

Outcome אינו בהכרח Verified Truth.
הוא יכול לשמש Product Learning.

---

# 62. Business Model

## CURRENT DIRECTION

Subscription.
Dealer משלם עבור:

> **Access to network liquidity and opportunities.**

Success Fee אינו הבסיס הנוכחי.
Pricing:

`OPEN`.

---

# 63. Cold Start

Cold Start הוא Risk חשוב.
הוא אינו Blocker לכל Product Discovery.
עדיין פתוחים:

* Minimum Contribution.
* Full Inventory day one vs gradual.
* Immediate Value.
* initial dealer count.
* geographic density.
* Pilot Ready threshold.

אין להמציא תשובות.

---

# 64. MVP Success Hypothesis

ה־MVP אינו נועד להוכיח:

> Dealers register.

הוא נועד לבדוק:

> **האם Private Inventory + Active Demand + Matching מייצרים B2B Connections משמעותיים שלא היו נוצרים אחרת?**

---

# 65. Potential Core Metrics

Current candidates:

* Verified Active Dealers.
* Fresh Inventory.
* Active Demand.
* Candidate Matches.
* Validated Matches.
* Buyer Interests.
* Seller Opportunities.
* Mutual Interests.
* Reveals.
* Outcomes.
* Reported Deals.
* Time to Match.
* rejection reasons.

Final KPI framework:

`OPEN`.

---

# 66. Kill Criteria

## OPEN — REQUIRED BEFORE PILOT

לפני Pilot אמיתי יש להגדיר מראש תנאים שבהם אומרים:

> **The hypothesis is not sufficiently supported.**

אין להגיב לתוצאות חלשות אוטומטית באמצעות Feature Creep.

---

# 67. Explicit Non-MVP

אין לבנות כרגע:

* Payments.
* Escrow.
* Financing.
* Auction engine.
* Logistics.
* Inspection marketplace.
* CRM.
* Advanced BI.
* Native apps.
* Public inventory marketplace.
* Dealer star ratings.
* anonymous negotiation engine.
* autonomous sales agent.
* full inventory management.
* mandatory external integrations.

---

# 68. Future Concepts — Do Not Implement

Already explored:

* MOVE.
* Trade-in Liquidity.
* Auctions.
* Liquidity Intelligence.
* Private Price Discovery.
* Hidden Floor/Maximum.
* Multi-party swaps.
* Advanced Trust.
* Behavioral matching.
* Native apps.

AI Agents must not treat appearance in this document as implementation approval.

---

# 69. System Invariants

הכללים הבאים צריכים להיחשב **Constitutional Product Rules**:

**I-01** — No Browse All Inventory.
**I-02** — Identity remains hidden until Mutual Interest.
**I-03** — One-sided Interest never causes Reveal.
**I-04** — Validation is not Interest.
**I-05** — Match is not Opportunity.
**I-06** — Hard Constraint cannot be overridden by score.
**I-07** — AI must not invent missing vehicle data.
**I-08** — AI must not invent user constraints.
**I-09** — Unknown is distinct from Match and Mismatch.
**I-10** — Private flexibility must never be revealed or hinted.
**I-11** — No original vehicle images before Reveal in MVP.
**I-12** — No Response is distinct from Reject.
**I-13** — Learning cannot silently modify explicit Hard Constraints.
**I-14** — Push exists to surface commercial value, not generate engagement.
**I-15** — Dealer should not have to maintain a duplicate inventory system.
**I-16** — Integrations may improve Core Product but cannot be required for its existence.
**I-17** — After Reveal, parties may continue outside the platform.
**I-18** — Interested is non-binding.
**I-19** — Information privacy includes inference risk, not only explicit identity fields.
**I-20** — AI/private data may improve matching but must not be used to manipulate one party against the other.

---

# 70. Decision Status Rules for AI Agents

Every product item belongs to one of:

### `LOCKED`

Implement only according to the defined behavior when development is authorized.
Do not reinterpret casually.

### `WORKING DIRECTION`

Preferred current hypothesis.
Do not hard-code without confirmation if implementation depends materially on it.

### `EXPLORED`

Already discussed.
Do not present as a new product insight without new reasoning.

### `REJECTED`

Do not implement.
Do not recommend again without explicitly addressing why it was previously rejected.

### `OPEN`

No decision.
Do not invent one.

---

# 71. AI Agent Instruction

When Cursor or another AI Agent encounters ambiguity:

**DO NOT:**

* choose a convenient default.
* infer product policy from database convenience.
* convert hypothesis into requirement.
* add features "because marketplaces usually have them."
* expose more information because it simplifies UX.
* add external dependency because it simplifies engineering.

**DO:**

1. Identify the relevant PRD section.
2. State the conflict.
3. Identify whether it is LOCKED / WORKING / OPEN.
4. Preserve all LOCKED invariants.
5. Ask for Product Decision where necessary.

---

# 72. Current High-Priority Open Product Decisions

The following are especially relevant to future implementation readiness:

**P-01 — Minimum Vehicle Dataset**
What fields must exist for Candidate/Validated Match?

**P-02 — B2B Price Workflow**
When/how is price requested and how long is it valid?

**P-03 — Freshness Policy**
What makes Inventory Fresh/Stale?

**P-04 — Buyer Match Card**
Exact anonymous fields.

**P-05 — Seller Opportunity Card**
Exact Demand information visible.

**P-06 — Buyer Budget Exposure**
Exact/range/relationship-only.

**P-07 — Match Score v1**
Weights and Unknown handling.

**P-08 — Alternative Push**
Which alternatives justify interruption?

**P-09 — Dealer Verification**
Requirements and process.

**P-10 — Trust v1**
Whether MVP uses Trust beyond Verified status.

**P-11 — Fishing Controls**

**P-12 — Inventory Initial Contribution**

**P-13 — Pilot Ready Threshold**

**P-14 — Pilot Metrics**

**P-15 — Kill Criteria**

**P-16 — Pricing**

---

# 73. Recommended Discovery Target

לפני Authorization לפיתוח מלא, אנחנו צריכים להיות מסוגלים לקחת **עסקה אחת דמיונית** ולהעביר אותה מתחילתה ועד סופה בלי להמציא כלל באמצע.

לדוגמה:

Dealer A מכניס Inventory.
Dealer B כותב:

> "מחפש CX-5 2022 ומעלה, עד 130, לא אדום."

ואז לדעת במדויק:

**איזה Data קיים → מה AI מפרש → מה Hard → מה Soft → אילו רכבים נפסלים → איזה Candidate נוצר → האם צריך Validation → מה Seller רואה → מה הוא מאשר → מה Buyer רואה → מה Buyer לא רואה → מה קורה ב־Interested → מה Seller רואה → מה Mutual Interest עושה → מה נחשף → מה קורה לאחר Reveal.**

אם בשלב כלשהו אנחנו אומרים:

> "פה כבר נראה מה נעשה"

יש עדיין Product Decision חסרה.

---

# 74. Product Definition in One Sentence

> **Private Dealer Exchange היא רשת B2B פרטית ואנונימית לסוחרי רכב, שבה Inventory ו-Demand נשארים מוסתרים מהרשת, מנוע Matching מזהה הזדמנויות ברקע, ורק כאשר שני סוחרים מביעים עניין בהתאמה הם נחשפים זה לזה וממשיכים את העסקה באופן עצמאי.**

---

# 75. Implementation Status

## CURRENT — Controlled Core MVP Build

**CORE MVP IMPLEMENTATION AUTHORIZED — CONTROLLED BUILD**

Product Discovery ממשיך במקביל לפיתוח.

המטרה: **Real Core MVP with changeable product rules** — מוצר אמיתי לבדיקות משתמש, Mobile UX, וחידוד Product Decisions תוך כדי תנועה. לא Prototype מזויף.

Use this document to:

* guide Core Loop implementation;
* challenge flows during user testing;
* identify and escalate missing decisions;
* maintain decision consistency;
* prevent feature creep;
* preserve all LOCKED invariants.

> **OPEN decisions remain OPEN.** Implementation must not invent them. See §78.

---

# 76. Platform — Mobile-first PWA

## LOCKED

המוצר ייבנה כ־:

**Mobile-first Progressive Web App (PWA)**

עם:

* חוויית Mobile-first מלאה
* שימוש גם בדסקטופ
* אפשרות התקנה למסך הבית
* Web Push Notifications
* Deep links מתוך Push למסך/אירוע הרלוונטי
* חוויית שימוש קרובה ל-Native ככל שניתן במסגרת PWA

Native iOS/Android apps **אינם** חלק מה-MVP (§67).

---

# 77. Notifications — Web Push

## LOCKED

Web Push הוא חלק מה-Core Product (§48).

המערכת צריכה להיות מסוגלת לשלוח Push עבור אירועים כגון:

* Validated Match
* Seller Opportunity
* Mutual Interest
* Validation Request
* Demand Expiry
* Freshness-related events

לא כל event חייב לייצר Push — חוקי Push הסופיים כפופים ל-§49–51.

### In-app = Source of Truth

כל אירוע חשוב **חייב** להישמר גם בתוך המערכת (internal notifications / activity).
Push הוא מנגנון התרעה, **לא** מקור האמת.

לחיצה על Push פותחת ישירות את המסך או האובייקט הרלוונטי (deep link).

### WhatsApp / Meta / Other Channels

WhatsApp אינו Core Infrastructure ואינו requirement ל-MVP (§4).
עתיד: WhatsApp, SMS, Email — **Accelerators / Additional Channels** בלבד.

---

# 78. Controlled Core MVP — Scope & OPEN Protocol

## מותר לבנות (Core Loop)

Authentication · Users · Dealer accounts · Dealer profiles · בסיס Dealer Verification · Database · Backend · Frontend · PWA infrastructure · Web Push infrastructure · Inventory · Inventory ingestion · Demand creation · Demand parsing · Matching Engine v1 · Candidate Matches · Validation flow · B2B Price flow · Validated Matches · Buyer Match experience · Interested / Reject / No Response · Seller Opportunity · Seller Interested / Reject / No Response · Mutual Interest · Reveal · internal notifications/activity · Outcome collection · Admin בסיסי לתפעול MVP

כל אלה חייבים לשמור על Invariants (§69) ועל Privacy (§8–10, §38–40).

## אסור לבנות (§67 + הרחבה)

Public marketplace · Browse All Inventory · Public dealer ratings · Auction · Payments · Escrow · Financing · Logistics · Inspection marketplace · Full CRM · Full inventory-management system · Native apps · Negotiation engine · Autonomous sales agent · Advanced BI · Product-critical WhatsApp dependency · Product-critical external API dependency

## UX / Design Validation

Frontend ו-Core Flow מתפתחים **יחד**. אין לדחות UX ל"אחרי Backend".
MVP חייב להיות ניתן ל: PWA install, Mobile navigation, Match Card clarity, Seller Opportunity clarity, Interested non-binding feel, Mutual Interest / Reveal moment — לבדיקות משתמש אמיתיות.

## OPEN Decision Protocol (during build)

כאשר implementation תלוי ב-`OPEN`:

1. ציין מספר החלטה (P-XX)
2. הסבר מה חוסם / משפיע
3. הצג 3 אפשרויות — יתרון, חסרון, השפעה על UX/Product/Complexity
4. Recommendation אחת
5. המתן ל-Product Decision לנקודה זו
6. המשך parallel בעבודה לא חסומה

אין להפוך `WORKING DIRECTION` ל-`LOCKED` ללא החלטה מפורשת.
עקוב: [docs/OPEN_DECISIONS.md](./docs/OPEN_DECISIONS.md)

---

# 79. Working Principle

> **Real Core MVP with changeable product rules.**

* Database, Backend, Users, Inventory, Demand, Matching, Push — **אמיתיים**
* Product Rules שאינן LOCKED — **ניתנים לשינוי** בעקבות בדיקות משתמש
* יש להימנע מ-hard-coding מיותר של Product Decisions שאינן LOCKED
* Discovery Walkthrough (§73) ממשיך במקביל — לגלות gaps ולסגור החלטות

---

# Appendix A. Final Instruction — Discovery Phase (Historical)

> **Superseded by §75–79.** Preserved for history.

Previously: **DO NOT BUILD FROM THIS DOCUMENT YET.** Product Discovery only until Core Loop could survive contact with real dealers.
