# 13 — Risks and Open Decisions

## עשרת הסיכונים החשובים ביותר

1. **מודל Auth הוא Cookie/JWT לדפדפן.** קליינט iOS/Android שאינו WebView אין לו חוזה כניסה יציב (אין refresh, revoke חלש, 30 יום).
2. **האפליקציה הקיימת היא WebView של האתר.** App Review עלול לראות "website wrapper" אם אין ערך native מספק (share/push/IAP). זה סיכון מוצר/חנות, לא רק טכני.
3. **Native push רשום ולא נשלח.** משתמשים יפעילו הרשאות ולא יקבלו התראות עד APNs/FCM.
4. **מחיקת חשבון חלקית.** ל-Store privacy labels ו-GDPR: User/Vehicles/Demands/media נשארים אחרי "מחיקה".
5. **אין reauthentication** לפני מחיקה או פעולות רגישות.
6. **OAuth ב-Web לא קיים; ב-native דרך plugin מותאם.** החלפת מעטפת שוברת login חברתי.
7. **שגיאות API לא אחידות + אין versioning.** שני קליינטים יישברו יחד בכל שינוי.
8. **מדיה על דיסק VPS דרך `/api/media`.** מובייל + תמונות מלאי = עומס ו-latency בלי CDN.
9. **OpenAI מקבל שיחות ותמונות לוחיות.** מדיניות פרטיות לחנויות חייבת לציין AI/third party במפורש; ה-Agent לא סמכות — אבל הנתונים כן יוצאים.
10. **מונטיזציה כבויה עם IAP בקוד.** אי-עקביות בתשובות ל-Apple/Google על תשלומים, או הפעלה חלקית שתשבור entitlement.

סיכון נוסף (11): **IDOR רך ב-`/api/events/interaction`.** לא פריצת מלאי, אבל חריגת isolation.

## החלטות ארכיטקטוניות לשלב הבא (לא להחליט בביקורת)

1. **מעטפת הלקוח:** להישאר על Capacitor WebView מול האתר, או UI מקורי (RN/Expo/native) שצורך API?
2. **Auth למובייל:** להרחיב NextAuth (cookie ב-WebView בלבד) מול Bearer/refresh/device sessions?
3. **Postgres host:** להישאר על Docker/VPS, או Supabase כ-Postgres מנוהל בלי Data API — בלי לבלבל עם Auth/RLS אלא אם נפתח במודע.
4. **Push:** מתי מחברים APNs/FCM, ומי מממן/מנהל credentials (OWNER).
5. **מחיקת חשבון:** disable מול hard-delete מול anonymize — מה מוצהר בחנות.
6. **Realtime:** להישאר polling או להוסיף ערוץ (לא חובה ל-MVP).
7. **CDN למדיה** מול המשך `/api/media` מאומת.
8. **API versioning** לפני קליינט שני.
9. **מונטיזציה ב-Store:** להשאיר OFF ולתעד, או IAP מיום הגשה.
10. **מפת iOS:** אין `.xcodeproj` על ה-host הנוכחי — מי בונה ומחתימים.
11. **Admin:** נשאר Web בלבד (מומלץ) ולא נכנס ל-Store.
12. **קטלוג ציבורי** `/c/[slug]`: Web SEO; לא חייב באפליקציית הסוחר.

## מה *לא* לפתוח עכשיו

- בחירת React Native / Expo / Capacitor כ"החלטת קבע" בלי 1 למעלה
- שכתוב matching/privacy
- הפעלת `MONETIZATION_ENABLED` בלי StoreBilling E2E
- חשיפת Prisma/Supabase anon לקליינט
