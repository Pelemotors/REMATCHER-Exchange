# Android Field Test — התקנה לבעל מוצר (בלי Google Play)

## מה זה

APK חתום לסביבת **Field Test בלבד**:

`https://field-test-exchange.rematcher.co.il`

Package: `co.rematcher.exchange`  
Version: `0.1.0-field-test`  
חתימה: Field-Test keystore נפרד (לא Production / לא ב־Git)

## הורדה

קישור ההתקנה (טוקן ארוך, לא לפרסום ציבורי) נמסר בנפרד לבעלים —  
קובץ מקומי בשרת: `.secrets/apk-download-token.txt`  
נתיב ציבורי:

`https://field-test-exchange.rematcher.co.il/owner-ft-apk/<TOKEN>/`

או ישירות:

`https://field-test-exchange.rematcher.co.il/owner-ft-apk/<TOKEN>/REMATCHER-FieldTest.apk`

## התקנה במכשיר Android רגיל

1. פתחו את קישור ההורדה ב־Chrome בטלפון
2. לחצו **הורד והתקן APK** / הורידו את הקובץ
3. אם Android מציג אזהרה — אשרו **התקנה ממקור זה** עבור Chrome / Files (חד־פעמי למקור)
4. התקינו את האפליקציה **REMATCHER Field Test**
5. פתחו פעם אחת → התחברו עם חשבון ה־Owner של Field Test:
   - `galsamama@gmail.com`
   - סיסמת Field Test לפי handoff (לא ב־Git)
6. WhatsApp → בחרו תמונות רכב → **Share** → **REMATCHER Field Test**
7. צפו ב־**קיבלנו** (durable ACK)

אין צורך ב־ADB, כבל USB, Developer Mode, או אישור ידני פר־משתמש מעבר להרשאת OS הסטנדרטית להתקנה ממקור לא־Store.

## מה האפליקציה עושה

WhatsApp Share → `ShareReceiverActivity` → staging מקומי עמיד → פתיחת האפליקציה →  
`ShareStaging` plugin מעלה עם session cookie → `/api/intake/batch` create/media/text/ack.

## אבטחה

- Keystore ו־סיסמאות רק תחת `.secrets/` (gitignore)
- נתיב ההורדה עם טוקן אקראי + `noindex`
- לא Production; לא מצביע ל־`exchange.rematcher.co.il`
