# 02 — Product Surface Map

Preserve the product. Rebuild the implementation.  
Admin remains Web. Public dealer catalog (`/c/[slug]`) remains Web unless a later product decision says otherwise.

**Web source of dealer chrome:** `src/app/(dealer)/**`, `src/config/mobile-nav.ts`, `src/app/(dealer)/layout.tsx`.

Layout gates today (must have Mobile equivalents): unauthenticated → login; email unverified → verify; REJECTED; PENDING approval; Privacy AI incomplete → privacy-ai; monetization ON + not entitled → subscription; onboarding incomplete → onboarding (from Home snapshot).

---

## Product Surface Matrix

| Current Web Route | Product Purpose | Main Actions | Important States | Mobile Screen IDs | Preserve/Improve |
|---|---|---|---|---|---|
| `/login` | Dealer credentials | login, OAuth buttons (native-only today), forgot | invalid, rate-limited, OAuth-only user, suspended (not enforced today — must enforce) | `AUTH.LOGIN` | Preserve. Improve: suspension + native OAuth via v1 |
| `/signup` | Create user+dealer | submit legal | validation, duplicate email | `AUTH.SIGNUP` | Preserve |
| `/forgot-password` | Start reset | email | always-ok response | `AUTH.FORGOT` | Preserve |
| `/reset-password` | Set password | token + new password | expired token | `AUTH.RESET` | Preserve + session revoke |
| `/verify-email` | Confirm email | token / resend | unverified loop | `AUTH.VERIFY` | Preserve |
| `/pending-approval` | Wait for dealer verify | none | PENDING | `AUTH.PENDING` | Preserve |
| `/rejected` | Dealer rejected | none | REJECTED | `AUTH.REJECTED` | Preserve |
| `/auth/redirect` | OAuth bridge | consume bridgeToken | expired bridge | n/a as WebView; Mobile uses v1 OAuth | Adapt to v1 tokens |
| `/privacy-ai` | AI/privacy consent gate | accept / complete | blocking all dealer routes | `ONB.PRIVACY_AI` | Preserve as blocking gate |
| `/onboarding` | Setup wizard | mark steps | shouldShowOnboarding | `ONB.SETUP` | Preserve |
| `/subscription` | Paywall | restore / IAP | monetization OFF today → unused | `BILL.PAYWALL` | Preserve capability; hidden while monetization off |
| `/home` | Work center, attention, CTA to capture | open blockers, go capture | empty attention, onboarding redirect | `HOME.ROOT` | Preserve hierarchy (opportunities outrank KPIs) |
| `/inventory` | Vehicle list + sold/archive + media | filter, search, sold, media | empty, filter empty, attention, missing price | `INV.LIST`, `INV.DETAIL`, `INV.MEDIA` | Preserve filters/actions. Native list/detail split is platform adaptation |
| `/intake` | Redirect to capture | — | — | (no screen) | Keep as alias deep link → capture |
| `/intake/handoff` | Capture conversation: camera, gallery, WhatsApp, intents | upload, intent, commit | processing, NEEDS_INFO, identified, rate limit | `CAP.ROOT`, `CAP.PROCESSING`, `CAP.CANDIDATE`, `CAP.INTENT` | **Preserve** — core product, not a form wizard |
| `/intake/review` | Pending intake batches | resume | empty | `CAP.REVIEW` | Preserve |
| `/demand` | Customer searches | parse, confirm, pause/resume, duplicate check | PENDING_CONFIRMATION, ACTIVE, EXPIRING, empty | `DEM.LIST`, `DEM.CREATE`, `DEM.CONFIRM`, `DEM.DETAIL` | Preserve parse→confirm |
| `/matches` | Buyer matches | interest, reject, open reveal | empty, truncated 12/40, stale focus | `MAT.LIST`, `MAT.DETAIL` | Preserve privacy DTO + actions |
| `/opportunities` | Seller opportunities | interest, reject | empty, stale_opportunity | `OPP.LIST`, `OPP.DETAIL` | Preserve |
| `/validations` | Availability / B2B price | confirm / decline | PENDING empty | `VAL.LIST`, `VAL.DETAIL` | Preserve |
| `/reveals/[id]` | Mutual interest contacts + outcome | copy phone, record outcome | not found, already revealed | `REV.DETAIL` | Preserve privacy (only after mutual) |
| `/activity` | In-app notifications | open entity, mark read | empty, take 50 | `ACT.LIST` | Preserve; add cursor later |
| `/account` | Profile, usage, push, logout, secondary nav | save profile, logout | | `ACC.ROOT` | Preserve. Secondary items stay in עוד |
| `/account/privacy` | Consents, memory, deletion | request/confirm delete | only_owner | `ACC.PRIVACY`, `ACC.DELETE` | Preserve + add reauth |
| `/customers` | CRM-lite | search, archive | empty | `CRM.LIST`, `CRM.DETAIL` | Preserve |
| `/catalog` | Digital storefront (≠ network visibility) | slug, publish, logo, finance | unpublished | `CAT.HOME` | Preserve as secondary |
| `/intelligence` | Anonymous network aggregates | read | threshold hiding | `NET.INTEL` | Preserve privacy thresholds |
| Agent overlay | Exchange Assistant 4.1 | send, confirm actions | fishing block, timeout 45s, pending confirmation | `AGT.THREAD` | Preserve server authority; native sheet/conversation |
| `/privacy` `/terms` | Legal | read | | `LEG.PRIVACY`, `LEG.TERMS` | Required for Store; in-app |
| `/offline` | PWA offline | — | | (native offline banners, not a page) | Adapt |
| `/admin/**` | Ops | — | | **out of app** | Web only |
| `/c/[slug]` | Public catalog | WhatsApp interest | public | **out of dealer app** | Web only |

---

## Surface counts

| Class | Count |
|---|---|
| Dealer App Router pages under `(dealer)/` | 19 (including `/intake` redirect) |
| Public auth/lifecycle pages used by dealers | 7 (`login` `signup` `forgot` `reset` `verify` `pending` `rejected`) |
| Agent overlay (not a route) | 1 |
| Legal | 2 |
| **Dealer-facing surfaces to preserve** | **28** (19−1 redirect + 7 + 1 agent + 2 legal = 28) |
| Admin pages | excluded |
| Public catalog | excluded |

OAuth `/auth/redirect` is a Web/Capacitor bridge, not a preserved dealer screen.

---

## States that must not be lost

| Kind | Where |
|---|---|
| Loading | dealer `loading.tsx` skeletons; inventory client fetch |
| Empty | `EMPTY_COPY` inventory / filter / matches / activity |
| Error | local banners; no global error.tsx — Mobile must still have a system |
| Capture NEEDS_INFO | Agent explains, not a form |
| Stale deep link | matches banner when entity gone |
| Email unverified / pending / rejected / privacy-ai / paywall | layout redirects |
| Reveal 402 allowance exhausted | Hebrew message + code |
| Vehicle unavailable / stale opportunity | 409 |
| Monetization off | paywall hidden; entitlement model still real |

---

## Notification / deep-link entry

Canonical paths already exist in `src/lib/deep-links.ts`: home, matches, opportunities, inventory, demand, intake, validations, reveals, activity, account, subscription, privacy-ai, onboarding, pending-approval, verify-email.

Every one of these must land on a Mobile screen in [08](./08-navigation-screen-inventory.md). `/admin` prefixes stay Web.

---

## Brand / product / platform

See [07-design-system.md](./07-design-system.md).

- **Brand invariant:** Midnight canvas, Gold R mark, Signal blue only when something happened, quiet private exchange.
- **Product invariant:** Match ≠ Opportunity ≠ Reveal; Capture is conversation; no auto-OWNED inventory; buyer never sees seller identity pre-reveal.
- **Platform adaptation:** Tab bar / NavigationBar, sheets, system share-in, camera permission sheets, back gesture. Not a desktop sidebar stacked vertically.
