# 06 — Mobile Compatibility

סיווג לכל יכולת:

- **A** Web-independent — השרת/דומיין לא תלוי בדפדפן  
- **B** reusable with adaptation  
- **C** Web-dependent  
- **D** should be rebuilt for native mobile

המעטפת הקיימת (Capacitor remote WebView) משנה את התשובה: דברים שהם C לדפדפן עשויים להיות B **בתוך WebView**, ועדיין D אם בוחרים UI מקורי.

| Capability | דירוג | ראיות | הערה |
|------------|--------|--------|------|
| Navigation (Next Link / App Router) | C / D ל-native UI | `app-shell-v2.tsx`, stalls + location.assign fallback | ב-WebView זה עובד חלקית; ל-native stack צריך rebuild |
| Browser history / back | C | `history.back` ב-Capacitor backButton | iOS/Android back ≠ App Router |
| Deep links | B | `src/lib/deep-links.ts`, `rematcher-exchange://` | allowlist קיים; Universal Links מוכנים חלקית |
| Auth cookies | C | NextAuth HttpOnly | WebView same-origin OK; native HTTP client לא |
| Auth callbacks / email links | C | verify/reset HTTPS | יידרש associated domains + in-app browser |
| OAuth | B (native plugin) / C (web) | SocialLogin; web error | כבר כיוון native |
| File upload | B | multipart APIs | input file ב-Web; native picker צריך אותו API |
| Camera | B | `capture=environment` + plugin share | Web input שביר ב-iOS WKWebView |
| Photo library | B | gallery input / Share | — |
| Sharing in | B | ShareStaging | אחת היכולות הבשלות למובייל |
| Clipboard | B | web + custom Clipboard plugin | — |
| Downloads | C | אין download UX | קטלוג/ייצוא יצטרך share sheet |
| External URLs | B | WhatsApp catalog links | `allowNavigation` |
| Web Push | C | SW + Notification API | לא APNs/FCM |
| Native push register | B | `/api/push/native-register` | delivery D עד credentials |
| localStorage | C | installation id, prompt dismissed | Preferences plugin קיים ולא מחליף הכל |
| sessionStorage | A (לא בשימוש) | — | — |
| IndexedDB | A (לא בשימוש) | — | — |
| Cookies | C | session | — |
| Service worker | C | `sw.js` | Capacitor לא משתמש ב-SW לדפדפן |
| Offline/cache | C / חלש | רק `/offline` | לא מוצר offline |
| Viewport | B | 390×844, `100dvh` | נבדק; עדיין הנחות מובייל-ווב |
| Keyboard | B | `--kb-inset`, Capacitor Keyboard | composer ב-intake תלוי בזה |
| Safe area | B | `env(safe-area-inset-*)` | — |
| RTL | B | `dir=rtl` + LTR ללוחיות/אימייל | ערבוב מכוון |
| Responsive / desktop rail | B | `min-width: 768` sidebar | טאבלט/desktop לא ה-SoT |
| PWA install | C / D כערוץ חנות | manifest | לא תחליף ל-Store |
| Matching/privacy/intake server | A | services | — |
| Agent HTTP | B | `/api/assistant/chat` | UI overlay הוא C |
| Realtime | D אם נדרש live | אין WS | polling |
| Media CDN | B | same-origin `/api/media` | מובייל יסבול בלי CDN/signed URLs |

## מסקנה

הדומיין (A) מוכן ל-consumer נוסף.  
שכבת ה-UX הנוכחית היא אתר (C).  
Capacitor הקיים הוא **אדפטציה של האתר**, לא אפליקציה מקורית.  
אם היעד הוא "אפליקציית iOS/Android מלאה" במובן Store עם UX מקורי — ה-UI הוא D או B-כבד, לא KEEP.
