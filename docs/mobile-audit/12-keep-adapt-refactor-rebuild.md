# 12 — KEEP / ADAPT / REFACTOR / REBUILD

כל החלטה לפי התאמה ל-**קליינט מובייל נוסף** (iOS+Android+Web), לא לפי חיסכון בעבודה.  
לא נבחר כאן framework.

## טבלה

| Subsystem | סיווג | למה |
|-----------|--------|-----|
| Matching engine v2 + SearchIntent | **KEEP** | דטרמיניסטי, לא תלוי UI, כבר משרת API |
| Privacy views / Reveal / Mutual Interest | **KEEP** | סמכות בשרת; נבדק בטסטים; אסור לפזר לקליינט |
| Intake pipeline (OCR, GOV, grouping, intent) | **KEEP** | באג 16-תמונות תוקן בשרת; APIs קיימים |
| Action Gateway + AI constitution | **KEEP** | מונע מהמודל להיות סמכות מסחר/פרטיות |
| Prisma domain model + Postgres | **KEEP** | מתאים לשלושה קליינטים; לא חובה Supabase |
| Entitlements / billing reconcile | **KEEP** | נכון עסקית; כבוי ב-flag |
| Resend transactional email | **KEEP** | לא תלוי UI |
| Health, version-check, devices | **KEEP** | כבר חושב multi-platform |
| REST `/api/*` כגבול | **ADAPT** | חסר אחידות שגיאות/pagination/version; אבל הגבול הנכון |
| File upload + Sharp media | **ADAPT** | החוזה multipart reusable; serving/CDN/signed URLs חסרים |
| Deep links allowlist | **ADAPT** | להרחיב ל-universal links + scheme בלי לשנות את הרעיון |
| Native push registration | **ADAPT** | רישום כן, delivery לא — לחבר ספק בלי לשנות טריגרים |
| Notification product events | **ADAPT** | אותה לוגיקה, transport שונה |
| Agent HTTP chat | **ADAPT** | ה-API reusable; ה-overlay הוא Web |
| Demand parse + screenshot classify | **ADAPT** | אותו backend; מקור התמונה native |
| RTL / safe-area / keyboard CSS | **ADAPT** | נכון ל-WebView; native UI יצטרך tokens מקבילים |
| Capacitor remote WebView | **ADAPT** אם נשארים על אתר-במעטפת; **REBUILD** אם היעד UI מקורי | היום זה אתר טעון מרחוק, לא מסכים native |
| ShareStaging / SocialLogin plugins | **ADAPT** | עדות שערוץ native כבר התחיל; לכפל ל-RN/Expo אם יוחלף המעטפת |
| Dealer visual shell (AppShellV2, intake conversation) | **ADAPT** ל-Web/PWA/WebView; **REBUILD** ל-native screens | Pixel-faithful הוא HTML/CSS |
| NextAuth cookie JWT 30d | **REFACTOR** | לא חוזה ל-native HTTP; אין refresh/revoke אמיתי |
| OAuth bridgeToken | **REFACTOR** | עובד כדבק; לא session סטנדרטי |
| Account deletion | **REFACTOR** | לא מוחק entities/קבצים/User; אין reauth |
| Error/pagination contracts | **REFACTOR** | ישברו קליינטים מרובים בלי גרסה |
| Cron `x-vercel-cron` על VPS | **REFACTOR** | שריד פריסה; צריך scheduler עצמאי |
| `/api/events/interaction` dealerId מה-body | **REFACTOR** | client-trust |
| PWA + SW כערוץ התראות יחיד | **REFACTOR** למובייל חנות | Web Push ≠ APNs/FCM |
| App Router navigation / history | **REBUILD** ב-native UI | stalls כבר תועדו; back/stack שונים |
| Web Push permission UX | **REBUILD** ב-native | OS permission שונה |
| `dealer-app/` scaffold | **REBUILD** / להתעלם | לא המוצר |
| Offline-first | **REBUILD** אם יידרש | היום network-first עם `/offline` דל |
| Realtime layer | **REBUILD** אם יידרש live | אין WS/SSE |

## איך לקרוא את זה

- **KEEP** = לא לגעת בלי סיבה בדומיין.
- **ADAPT** = אותו רעיון, חוזה/transport/lifecycle למובייל.
- **REFACTOR** = חובה *לפני* קליינט native ראשון (בעיקר auth + deletion + contracts).
- **REBUILD** = לא להעתיק את מנגנון ה-Web כמות שהוא לתוך Store app מקורי.

המלצת כיוון (עדיין לא בחירת framework):  
לשמור backend דומיין; לא לדמיין ש-Capacitor WebView = "אפליקציה מלאה" אם הדרישה היא UX מקורי; לא לזרוק את Prisma/matching/privacy.
