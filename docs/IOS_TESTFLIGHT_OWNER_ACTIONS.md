# iOS TestFlight — פעולות חיצוניות לבעלים בלבד

Engineering **לא** יכול לעקוף Apple signing / distribution.  
Adapters (Share Extension + App Group) קיימים בקוד תחת `mobile/ios/`.

## מה חסר כדי להגיע ל־TestFlight External עם Share

| # | פעולה שלך | למה |
|---|-----------|-----|
| 1 | Apple Developer Program membership פעיל | חתימה + TestFlight |
| 2 | App ID: `co.rematcher.exchange` | Containing app |
| 3 | App ID ל־Share Extension (למשל `co.rematcher.exchange.ShareExtension`) | Share Sheet |
| 4 | Capability: **App Groups** — `group.co.rematcher.exchange` על שני ה־IDs | Staging משותף |
| 5 | יצירת App ב־App Store Connect | TestFlight |
| 6 | Distribution certificate + provisioning profiles (App + Extension) | Build חתום ב־Xcode/CI |
| 7 | Build + upload ל־App Store Connect (ממק־עם Xcode; אין macOS ב־VPS הזה) | Binary ל־TestFlight |
| 8 | TestFlight → External testing + Beta App Review לפי הצורך | התקנה למשתמש רגיל |

## מה כבר מוכן בקוד

- `mobile/ios/App/ShareExtension/ShareViewController.swift`
- `Info.plist` ל־Extension
- חוזה deep link: `rematcher-exchange://intake?clientBatchId=…&source=IOS_SHARE`
- Field Test URL ל־Web: `https://field-test-exchange.rematcher.co.il`

## מה לא ניתן בשרת הזה

- אין Xcode / macOS → אין build/IPA מכאן
- אין Apple credentials בשרת (בכוונה)

## אחרי ש־1–8 בוצעו

הנדסה תחבר את ה־Extension לפרויקט Capacitor iOS, תבנה מול `MOBILE_WEB_URL` של Field Test, ותעלה ל־TestFlight.
