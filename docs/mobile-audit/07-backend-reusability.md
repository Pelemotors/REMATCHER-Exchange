# 07 — Backend Reusability

השאלה: האם ה-backend יכול לשרת בבטחה Web + iOS + Android כ-consumers.

תשובה קצרה: **הדומיין כן; חוזה ה-API חצי-מוכן; מודל ה-auth לא.**

אין צורך להחליף Postgres/Prisma. "Supabase" היום הוא לכל היותר host אפשרי ל-Postgres, לא פלטפורמת מוצר.

## מה כבר reusable

| נושא | מצב |
|------|------|
| REST תחת `/api/*` | ~103 handlers, JSON |
| Guards | session → dealerId בשרת |
| Intake/inventory/demand/match/reveal | APIs קיימים |
| Multipart uploads | אותם endpoints ל-WebView ול-native HTTP |
| Idempotency | מפתחות ב-events/push/intake/matching |
| Health + `POST /api/app/version-check` | IOS\|ANDROID\|WEB |
| Devices register/revoke | מודל התקנות |
| Native push **registration** | endpoint קיים |
| Feature flags / kill switches | ב-health |

## פערים ל-3 clients

### Authentication model

היום: cookie JWT לדפדפן/WebView.  
אין: OAuth2/OIDC token endpoint, refresh, device-bound session, cookie-less Authorization header.

בלי זה, iOS/Android **שאינם WebView** לא יכולים להתחבר כמו שצריך.

OAuth native כבר עוקף חלקית דרך bridgeToken — זה דבק, לא חוזה יציב.

### Authorization

טוב מספיק אם כל קליינט עובר את אותם APIs. סכנה: קליינט native שיקרא שדות מיותרים — השרת כבר חותך ב-DTO לרשת. לא לסמוך על הקליינט.

### Versioning

`agentVersion` / `matchingEngine` ב-health. **אין** `/api/v1`. שינוי breaking ישבור WebView ו-native יחד.

### Error formats

רוב `{ error: string }` + status. לא אחיד (`code`, 402 entitlement, 200 עם error פנימי ב-intake). קליינט native יצטרך טבלת מיפוי שברירית.

### Pagination

רק inventory מלא (`page/pageSize/hasMore`). Matches/demands/notifications — לא cursor אחיד.

### Realtime

אין. Mobile יצטרך polling כמו ה-Web, או להוסיף ערוץ בעתיד. לא חוסם MVP אם מקבלים delay.

### Push

רישום native קיים; **שליחה** לא מחוברת ל-APNs/FCM (OWNER_BLOCKED ל-credentials). הלוגיקה של "מתי ליצור Notification" reusable.

### Files

`/api/media` מאחורי auth — OK. אין signed URL קצרי-חיים ל-CDN. תמונות מלאי במובייל יעברו דרך האפליקציה/VPS.

### Rate limits

Per-email/IP/dealer לנקודות רגישות. אין budget per-device. אפליקציה עם retries אגרסיביים עלולה לפגוע ב-login.

### Idempotency

קיים באירועים עסקיים. לא כל POST של UI (למשל לחיצת intent כפולה) חשוף כמפתח קליינט.

## המלצה ארכיטקטונית (החלטה, לא יישום)

להתייחס ל-`/api` כאל backend יחיד לשלושת הקליינטים, אבל **לפני** native UI מלא:

1. Auth שמתאים למובייל (session/token מפורש).
2. שגיאות + pagination אחידים.
3. לא לפתוח את הדאטאבייס לקליינט.

Web הנוכחי יכול להישאר consumer ראשון.
