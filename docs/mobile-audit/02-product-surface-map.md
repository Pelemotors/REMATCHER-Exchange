# 02 — Product Surface Map

מיפוי לפי `src/app/**/page.tsx`, layouts, קומפוננטות, ו-API — לא רק רשימת routes.

## 1. קבוצות layout

| קבוצה | Layout | Auth |
|--------|--------|------|
| ציבורי | `src/app/layout.tsx` | אין / redirect אם מחובר |
| סוחר | `src/app/(dealer)/layout.tsx` | JWT dealer + שרשרת gates |
| אדמין | `src/app/admin/layout.tsx` | JWT admin נפרד |
| קטלוג ציבורי | בלי AppShellV2 | אין |

Shell סוחר במובייל: `AppShellV2` — header קומפקטי + bottom nav. אדמין **לא** מקבל את ה-shell הזה.

## 2. Bottom nav (RTL ויזואלי אחרי `direction: ltr` ב-nav)

מקור: `src/config/mobile-nav.ts`

| תווית | href |
|--------|------|
| בית | `/home` |
| המלאי | `/inventory` |
| קליטת רכב | `/intake/handoff` |
| חיפוש | `/demand` |
| עוד | `/account` |

משניים (עוד / rail): `/matches`, `/customers`, `/intelligence`, `/activity`, `/opportunities`.

## 3. מסכי סוחר

| Route | Purpose | כניסה | APIs עיקריים | קריאה/כתיבה | Web-only / native |
|-------|---------|--------|----------------|-------------|-------------------|
| `/home` | Work center, CTA לקליטה | nav, post-auth | snapshot server-side; demands parse inline | read + create demand | `next/navigation` |
| `/inventory` | רשימת רכבים, מחיקה/נמכר, מדיה | nav | `/api/inventory`, `/api/inventory/media` | R/W | file input, client fetch (לא SSR list) |
| `/intake/handoff` | Capture → שיחה → כוונות | FAB / share | `/api/intake/batch`, `/api/intake/intent`, `/api/demands/parse` | R/W media+candidates | camera/`capture`, gallery, Capacitor ShareStaging |
| `/intake/review` | באצ'ים ממתינים | לינק | `/api/intake/review` | R/W | — |
| `/demand` | חיפושי לקוח | nav | `/api/demands*`, `/api/matches?demandId=` | R/W | clipboard paste |
| `/matches` | התאמות קונה | עוד | `/api/matches` | R + interest | polling + `document.visibility` |
| `/opportunities` | צד מוכר | עוד | `/api/opportunities`, `/api/dealer-opportunities` | R + interest | — |
| `/validations` | אימות זמינות/B2B | push deep link | `/api/validations*` | R/W | — |
| `/reveals/[id]` | אחרי Mutual Interest | push / matches | `/api/reveals/[id]` | R/W outcome | clipboard write (טלפון) |
| `/customers` | לקוחות | עוד | `/api/customers` | R/W | — |
| `/intelligence` | מודיעין רשת אנונימי | עוד | `/api/intelligence` | read aggregates | — |
| `/catalog` | קטלוג דיגיטלי | עוד | `/api/catalog/*` | R/W | file logo |
| `/activity` | התראות in-app | עוד | `/api/notifications` | R | — |
| `/account` | פרופיל, push, logout | nav עוד | `/api/account/*`, `/api/push/*` | R/W | Notification API / native push |
| `/account/privacy` | הסכמות, זיכרון, מחיקה | account | `/api/privacy/*` | R/W/D | אין reauth סיסמה |
| `/onboarding` | setup wizard | redirect מ-home | `/api/onboarding` | R/W | — |
| `/privacy-ai` | gate הסכמות AI | layout | `/api/privacy/onboarding/complete` | W | חוסם את כל ה-dealer routes |
| `/subscription` | paywall | layout אם monetization ON | `/api/billing/*` | R/W verify | Capacitor StoreBilling |

## 4. מסכים ציבוריים

`/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/pending-approval`, `/rejected`, `/auth/redirect`, `/privacy`, `/terms`, `/offline`, `/c/[slug]`, `/c/[slug]/vehicles/[vehicleId]`.

OAuth כפתורים ב-Web מציגים שגיאה — **native only** (`SocialLogin` plugin).

## 5. אדמין

`/admin` ו-16 מסכי תפעול (dealers, users, communications, system, …). Auth נפרד, session 8 שעות. לא חלק מחוויית App Store של הסוחר.

## 6. Overlays

| Surface | סוג | הערה |
|---------|-----|------|
| Agent Workspace | overlay / focus / desktop panel | `showFab=false`; נפתח מ-context |
| Intake conversation | full page | לא form/wizard |
| Inventory agent panel | inline | — |
| Push onboarding prompt | overlay | PWA |
| Confirm archive/sold | inline Surface | אין modal library |
| `BottomSheet` | קיים ב-UI kit | **לא מחובר לאף מסך** |

אין `error.tsx`. יש `loading.tsx` לכמה routes. Empty: `EmptyStateV2` + `EMPTY_COPY`.

## 7. Flows מקצה לקצה (עדות)

### קליטת רכב
Capture cards → multipart `/api/intake/batch` → ACK מיידי → OCR/GOV ברקע → כרטיסי Candidate → intent → Vehicle לפי `dealerRelationship`. אין auto-OWNED.

### ביקוש מלקוח
טקסט / paste / צילום WhatsApp → classify → `/api/demands/parse` → confirm → SearchIntent → matching.

### Match פרטי
Demand ANONYMOUS_NETWORK × Vehicle ANONYMOUS_NETWORK+mediaReady → CandidateMatch → buyer view בלי זהות → interest → seller opportunity → mutual → Reveal עם contactJson.

### Share מ-WhatsApp (native)
Share Extension / Android intent → ShareStaging → `/intake/handoff?staged=1` → consumeAndUpload.

## 8. Browser APIs בשימוש

Clipboard, file/camera input, Notification + Service Worker, localStorage (`rmx-installation-id`), `history.replaceState` (batchId), `visualViewport`, CustomEvents.  
**לא:** geolocation, IndexedDB, sessionStorage, Web Share API, download manager.

## 9. מצבי שגיאה/ריק/טעינה

- Loading: skeletons ב-dealer routes נבחרים; inventory טוען ב-client.
- Empty: מלאי/חיפושים/התאמות.
- Error: באנר אדום מקומי; אין error boundary גלובלי.
- Intake: Agent מסביר NEEDS_INFO במקום form.
- Stale deep-link: באנר ב-matches כשהישות נעלמה.
