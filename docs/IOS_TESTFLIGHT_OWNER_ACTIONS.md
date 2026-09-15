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

- Share Extension אמיתי: `mobile/ios/App/ShareExtension/` (images ≤40 + text, App Group staging)
- Capacitor iOS `ShareStaging` plugin: `mobile/ios/App/ShareStaging/` (upload + ACK כמו Android)
- Deep link: `rematcher-exchange://intake?clientBatchId=…&source=IOS_SHARE&staged=1`
- Web: `/intake/handoff` קורא ל־`ShareStaging` גם עבור `IOS_SHARE`
- עזרה ל־Mac: `mobile/ios/apply-share-sources.sh` + `AppDelegate+IntakeShare.swift.example`
- Field Test URL ל־Web: `https://field-test-exchange.rematcher.co.il`

## מה לא ניתן בשרת הזה

- אין Xcode / macOS → אין `.xcodeproj` / IPA מכאן
- אין Apple credentials בשרת (בכוונה)
- **לא ניתן להכריז PASS על Share Sheet בלי iPhone + build חתום**

## אחרי ש־1–8 בוצעו

על Mac: `npx cap add ios` → `bash mobile/ios/apply-share-sources.sh` → Xcode target/signing → TestFlight.  
רק אז לבדוק: Photos/WhatsApp → Share → REMATCHER Exchange → Intake.
