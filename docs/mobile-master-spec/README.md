# REMATCHER Exchange Mobile — Master Spec

**Status:** Specification only. Not an implementation. Not a repository.  
**Gate 0 approved.** Milestone 1 iPhone backend is Production `https://exchange.rematcher.co.il`.  
**Production baseline:** `6e1eda818b0daf567785953aa656711569f62179`  
**Backend:** `Pelemotors/REMATCHER-Exchange`  
**Canonical product:** https://exchange.rematcher.co.il

This folder is the **Build Blueprint** for REMATCHER Exchange Mobile.  
Do not start Swift, Kotlin, `/api/v1`, Auth, Push, migrations, or a new git repo until this spec is explicitly approved.

---

## Locked decisions

1. New independent repository: `REMATCHER-Exchange-Mobile`.
2. iOS = Swift + SwiftUI. Android = Kotlin + Jetpack Compose.
3. Not Capacitor, WebView, PWA wrapper, React Native, or Expo.
4. Existing Exchange remains the server-authoritative business system.
5. Mobile never talks to PostgreSQL or OpenAI.
6. Matching / Interest / Validation / Opportunity / Reveal / Privacy / Action Gateway stay on the server.
7. Rebuild the implementation. **Preserve the product.**
8. Native platform patterns (sheets, back, permissions) without changing REMATCHER product language.
9. Web Production keeps NextAuth cookies. Mobile Auth is additive.
10. Current Production data path is Prisma → Docker PostgreSQL 16 on the VPS. Supabase/Vercel-as-Production docs are stale.

Existing implementation is evidence, not a constraint. Approved product/design **is** a constraint.

---

## Index

| File | Contents |
|---|---|
| [01-architecture.md](./01-architecture.md) | System context, repo structure, shared-contract rule |
| [02-product-surface-map.md](./02-product-surface-map.md) | Product preservation matrix |
| [03-api-contract.md](./03-api-contract.md) | `/api/v1` map, errors, pagination |
| [04-auth-security.md](./04-auth-security.md) | Auth, authorization tests, security gates |
| [05-ios-architecture.md](./05-ios-architecture.md) | SwiftUI app architecture |
| [06-android-architecture.md](./06-android-architecture.md) | Compose app architecture |
| [07-design-system.md](./07-design-system.md) | Tokens, invariants, RTL, a11y |
| [08-navigation-screen-inventory.md](./08-navigation-screen-inventory.md) | IA + every screen |
| [09-push-deep-links.md](./09-push-deep-links.md) | APNs/FCM, events, Universal Links |
| [10-media-agent.md](./10-media-agent.md) | Uploads, Agent contract |
| [11-account-privacy-store.md](./11-account-privacy-store.md) | Lifecycle, deletion, Store checklists |
| [12-testing-qa.md](./12-testing-qa.md) | Pyramid, device matrix, observability |
| [13-work-packages.md](./13-work-packages.md) | Reviewable packages + DoD |
| [14-dependency-graph.md](./14-dependency-graph.md) | Order and parallel tracks |
| [15-risk-register.md](./15-risk-register.md) | Top risks |
| [16-open-decisions.md](./16-open-decisions.md) | Product / legal / technical decisions |
| [17-implementation-roadmap.md](./17-implementation-roadmap.md) | Phases A–G and gates |

Related evidence (not superseded where code contradicts):

- `docs/mobile-audit/phase-3b-backend-gap-analysis.md`
- `docs/mobile-audit/phase-3b-api-map.md`
- `docs/mobile-audit/phase-3b-data-map.md`
- `src/config/brand-v2.ts` (live tokens — prefer over older Brand System tables)

---

## First implementation package (after approval)

**B01 — Mobile API foundation**  
Required gate: **Gate 0**.  
Must not start before explicit approval of this spec.
