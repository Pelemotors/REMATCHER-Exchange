# System Invariants — Private Dealer Exchange

מסמך Reference מהיר לכללי המערכת החוקתיים (Constitutional Product Rules).
מקור: [PRD_CORE.md](../PRD_CORE.md) — סעיף 69.

| ID | כלל | מקור PRD | הערות |
|----|-----|----------|-------|
| I-01 | No Browse All Inventory — אין גלישה חופשית במלאי הרשת | §7 | Marketplace ציבורי אסור |
| I-02 | Identity remains hidden until Mutual Interest | §9 | זהות Dealer מוסתרת |
| I-03 | One-sided Interest never causes Reveal | §9, §12 | Interest חד-צדדי ≠ חשיפה |
| I-04 | Validation is not Interest | §14, §22 | אימות זמינות/מחיר ≠ Seller Interested |
| I-05 | Match is not Opportunity | §13 | Algorithmic Match ≠ אירוע מסחרי ל-Seller |
| I-06 | Hard Constraint cannot be overridden by score | §28 | Constraint קשיח לא נשבר בגלל Score |
| I-07 | AI must not invent missing vehicle data | §19, §30 | Unknown ≠ Match; אין השלמת נתונים |
| I-08 | AI must not invent user constraints | §29 | אין להסיק Hard Constraint שלא נאמר |
| I-09 | Unknown is distinct from Match and Mismatch | §30 | שלוש מצבים: MATCH / MISMATCH / UNKNOWN |
| I-10 | Private flexibility must never be revealed or hinted | §32, §47 | מידע פרטי לשימוש פנימי בלבד |
| I-11 | No original vehicle images before Reveal in MVP | §38 | סיכון inference + לא נדרש ל-Interest |
| I-12 | No Response is distinct from Reject | §44 | NO_RESPONSE ≠ REJECTED |
| I-13 | Learning cannot silently modify explicit Hard Constraints | §46 | Explicit instruction > inferred preference |
| I-14 | Push exists to surface commercial value, not generate engagement | §48–49 | Push = Signal of Commercial Value |
| I-15 | Dealer should not have to maintain a duplicate inventory system | §18 | מזער duplicate entry ו-maintenance |
| I-16 | Integrations may improve Core Product but cannot be required | §4 | Integration = Accelerator, not Dependency |
| I-17 | After Reveal, parties may continue outside the platform | §10 | אין חובה להמשיך בתוך המוצר |
| I-18 | Interested is non-binding | §12 | לא התחייבות לקנייה/מכירה |
| I-19 | Information privacy includes inference risk | §40 | בדיקה: מה ניתן להסיק משילוב מידע? |
| I-20 | AI/private data may improve matching but must not manipulate | §47 | אסור weaponize מידע פרטי |

## שימוש

- לפני כל החלטת UX, Matching, או Data Model — וודא שאין הפרה של Invariant.
- **Controlled Core MVP Build:** Invariants I-01–I-20 בתוקף מלא — גם בקוד.
- אם יש קונפלikt בין Invariant לדרישה חדשה — **Flag the ambiguity** ואל תפתור בשקט.
