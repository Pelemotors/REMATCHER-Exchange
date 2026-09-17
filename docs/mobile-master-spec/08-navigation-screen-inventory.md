# 08 — Navigation & Screen Inventory

## Information architecture

**Primary tabs (RTL visual order matches Web bottom nav):**

1. בית → `HOME.ROOT`
2. המלאי → `INV.LIST`
3. קליטת רכב → `CAP.ROOT` (center capture affordance)
4. חיפוש → `DEM.LIST`
5. עוד → `ACC.ROOT`

**Not a tab (reachable from Home attention, עוד, push, Agent):**

Matches, Opportunities, Validations, Reveal, Activity, Customers, Catalog, Intelligence, Intake review, Privacy, Agent.

Agent entry: header orb / context from any primary screen (same as `AgentWorkspaceProvider`). Not a sixth tab.

**Modal/sheet:** sold confirm, intent picker, Agent confirmation, camera permission, photo picker, logout confirm, deletion confirm.

**Back:** details pop to their list; Capture stays a tab (does not “back” to Home unless user hits בית). Deep link into Reveal: back → Matches or Opportunities depending on role, else Home.

---

## Screen master inventory

States listed are required. Offline: show last cached list if any + banner; mutating actions disabled with retry. Unless noted, loading = skeleton, error = banner + code-driven retry.

### Auth & gates

| ID | Name | Purpose | Web | API | Primary | Secondary | Empty | Push/DL | iOS | Android |
|---|---|---|---|---|---|---|---|---|---|---|
| AUTH.LOGIN | התחברות | credentials | `/login` | login | התחבר | forgot, signup, Apple/Google | — | after logout | system password | credential manager optional later |
| AUTH.SIGNUP | הרשמה | create dealer | `/signup` | signup | יצירת חשבון | legal links | — | | | |
| AUTH.FORGOT | שכחתי סיסמה | start reset | `/forgot-password` | forgot | שליחה | | | | | |
| AUTH.RESET | סיסמה חדשה | token | `/reset-password` | reset | שמירה | | expired | | | |
| AUTH.VERIFY | אימות אימייל | gate | `/verify-email` | verify/resend | רענון / שליחה מחדש | | waiting | | | |
| AUTH.PENDING | ממתין לאישור | PENDING | `/pending-approval` | me | — | logout | | | | |
| AUTH.REJECTED | נדחה | REJECTED | `/rejected` | me | logout | | | | | |
| AUTH.SUSPENDED | חשבון מושעה | SUSPENDED | missing on Web login | me/login error | logout | | | | **new screen** — product-preserve of a missing Web state | |
| ONB.PRIVACY_AI | הסכמות AI | blocking | `/privacy-ai` | privacy complete | אישור | legal | | | | |
| ONB.SETUP | הוספה ראשונית | wizard | `/onboarding` | onboarding | המשך | skip if product allows | | | | |
| BILL.PAYWALL | מנוי | entitlement | `/subscription` | paywall | רכישה/שחזור | | hidden if monetization off | | StoreKit 2 | Play Billing |
| LEG.PRIVACY | מדיניות | legal | `/privacy` | static/URL | | | | Store | SafariView / WebView **read-only legal** (not product WebView app) | Custom Tabs |
| LEG.TERMS | תנאים | legal | `/terms` | | | | | Store | same | same |

Read-only in-app Safari/Custom Tabs for legal is **not** a Capacitor product shell.

### Core dealer

| ID | Name | Purpose | Web | API | Primary | Secondary | Empty | Offline | DL |
|---|---|---|---|---|---|---|---|---|---|
| HOME.ROOT | בית | work center | `/home` | me + matches/opps/validations snapshot | קליטת רכב | attention rows | no blockers: quiet home + CTA | cache snapshot | `/home` |
| INV.LIST | המלאי | list/filter | `/inventory` | inventory | add/capture | filters, search | EMPTY_COPY.inventory | cache | `/inventory` |
| INV.DETAIL | רכב | one vehicle | list row | inventory/{id} | edit / network visibility | sold, archive, media | | | `?focus=` |
| INV.MEDIA | מדיה | gallery | media API | media | add photo | delete, primary | no photos | | enrich flag |
| INV.SOLD_CONFIRM | אישור נמכר | irreversible-ish | inline | PATCH sold | אישור | ביטול | | no auto retry | |
| CAP.ROOT | קליטת רכב | conversation capture | `/intake/handoff` | intake batches | מצלמה | gallery, WhatsApp hint, text | first-run hint | no silent upload retry | `/intake` |
| CAP.PROCESSING | עיבוד | OCR/GOV | same | GET batch | — | | | | |
| CAP.CANDIDATE | כרטיס רכב מזוהה | choose intent | same | intent | שמירה לפי כוונה | | NEEDS_INFO via agent copy | | |
| CAP.INTENT | 2×2 intents | OWNED/OFFERED/EXTERNAL/TRADE | same | intent | choose | | | | |
| CAP.REVIEW | באצ'ים ממתינים | resume | `/intake/review` | review | פתיחה | | אין ממתינים | | |
| DEM.LIST | חיפושים | my searches | `/demand` | demands | חיפוש חדש | pause | no searches | cache | `/demand` |
| DEM.CREATE | ביקוש לקוח | text/image parse | `?new=1` | parse | שליחה | paste | | no auto retry | |
| DEM.CONFIRM | אישור פרסור | PENDING_CONFIRMATION | confirm | confirm | הפעלה | edit | | idempotent | |
| DEM.DETAIL | חיפוש | lifecycle + matches | edit= | demands/{id} | matches | pause/close | | | |
| MAT.LIST | התאמות | buyer | `/matches` | matches | open | | EMPTY_COPY.matches | cache | `/matches?focus=` |
| MAT.DETAIL | התאמה | interest | same | interest | מעוניין | דחייה | | **idempotent, no auto retry** | |
| OPP.LIST | הזדמנויות | seller | `/opportunities` | opportunities | open | | none | cache | `?focus=` |
| OPP.DETAIL | הזדמנות | interest | | interest | מעוניין | דחייה | stale 409 | no auto retry | |
| VAL.LIST | אימותים | pending | `/validations` | validations | open | | none pending | | |
| VAL.DETAIL | אימות | confirm availability/price | | POST | אישור | לא זמין | | no auto retry | `?focus=` |
| REV.DETAIL | חיבור | contacts + outcome | `/reveals/[id]` | reveals | copy phone | outcome | 403/404 | | `/reveals/{id}` |
| ACT.LIST | פעילות | inbox | `/activity` | notifications | open entity | mark read | EMPTY_COPY.activity | cache | `/activity` |
| AGT.THREAD | הסוכן | assistant 4.1 | overlay | agent/turns | שליח | confirm gateway | empty composer | no auto retry writes | context entity |
| ACC.ROOT | עוד | hub | `/account` | me, usage, push | open children | logout | | | `/account` |
| ACC.PROFILE | פרטי עסק | edit | account form | PATCH me | שמור | | | | |
| ACC.PUSH | התראות | prefs + permission | PushSettings | devices + prefs | enable | | denied OS | | `#push` |
| ACC.PRIVACY | פרטיות ו-AI | consents/memory | `/account/privacy` | privacy | save | | | | |
| ACC.DELETE | מחיקת חשבון | owner | deletion API | reauth+delete | בקשה/אישור | | only_owner | | |
| CRM.LIST | לקוחות | list | `/customers` | customers | add | search | empty | | |
| CRM.DETAIL | לקוח | | | | save | archive | | | |
| CAT.HOME | קטלוג דיגיטלי | slug/publish | `/catalog` | catalog | publish | logo | unpublished | | |
| NET.INTEL | מודיעין רשת | aggregates | `/intelligence` | intelligence | — | | below threshold | | |

---

## Screen/state count

- **Distinct screen IDs above: 46**
- Plus per-screen required states (loading/empty/error/offline) tracked in QA, not as separate IDs.
- Missing Web login suspension → `AUTH.SUSPENDED` is an **Improve** that preserves an existing accountStatus the Web failed to surface.

No dealer Web route is omitted. `/intake` is an alias to `CAP.ROOT`. Admin and public catalog are intentionally absent.

---

## Entry / exit / back (primary screens)

| Screen | Entry | Exit | Back | Primary | Secondary |
|---|---|---|---|---|---|
| HOME | tab, post-login, DL | tabs, attention | — | Capture | attention |
| INV.LIST | tab | detail, capture | tab stays | Capture | filter |
| CAP.ROOT | tab, Home CTA, share-in | inventory/demand after commit | tab | shutter | gallery |
| DEM.LIST | tab | create/detail | tab | new search | |
| ACC.ROOT | tab | children, logout | tab | children | logout |
| MAT.LIST | עוד, Home, DL, push | detail | עוד or Home | open match | |
| AGT.THREAD | orb | dismiss sheet | dismiss | send | confirm |

Share-in from WhatsApp is a **native capability** (not Capacitor ShareStaging). Tracked as P3 after Capture V1 unless product requires it for Gate 4.
