# 07 — Design System

**Source of truth for values:** live `src/config/brand-v2.ts` + `src/app/globals.css` (`:root` / `[data-brand-ui="2"]`).  
Older tables in `docs/BRAND_SYSTEM.md` (Midnight `#070C14`, Signal `#2D78A8`) are **stale** relative to code. Mobile uses the **code** tokens.

The root layout already sets `data-brand-ui="2"` globally. Gold R mark is the primary brand mark; the network Exchange Mark (`> ◆ <`) is for processing/history states.

---

## A. Brand invariant (do not redesign)

| Token name | Value | Use |
|---|---|---|
| `color.background.primary` | `#0B1114` | Midnight canvas |
| `color.surface.default` | `#121A22` | Deep navy surface |
| `color.surface.raised` | `#1A2330` | Cards |
| `color.surface.secondary` | `#1F2937` | Graphite / nav |
| `color.text.primary` | `#EBEDEF` | Platinum / warm white |
| `color.text.secondary` | `rgba(235,237,239,0.72)` | |
| `color.text.muted` | `rgba(235,237,239,0.48)` | |
| `color.border.default` | `rgba(235,237,239,0.10)` | |
| `color.brand.gold` | `#D4AF3B` | R mark, brand emphasis |
| `color.signal.exchange` | `#2E68F7` | Match / active / something **happened** |
| `color.semantic.success` | `#22A06B` | Genuine success only |
| `color.semantic.warning` | `#E08A1E` | Opportunity / attention |
| `color.semantic.error` | `#E24B4B` | Errors |
| Exchange Mark states | `idle \| searching \| converging \| matched` | Motion CSS/Swift/Compose, respect Reduce Motion |
| Gold R | `BRAND_ASSETS_V2.rMarkGold` | Primary identity |
| Typeface | Heebo (Hebrew-first) | License for native apps — **open technical** (file embedding) |
| Principle | **Nothing glows unless something happened** | |

Typography hierarchy (names, not px-perfect desktop): `display`, `hero`, `title`, `section`, `body`, `secondary`, `label`, `caption`, `micro`, `data`.

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.  
Touch min 44px. CTA height 52. Input 48. Row min 72. Bottom nav 64 + safe area.  
Radius sm 8 / md 12 / lg 16 / xl 20 / pill.

iOS and Android **must use the same token names** in `contracts/design/tokens.json`. Implementation is platform-native (Color vs ColorResource).

---

## B. Product invariant

- Match, Opportunity, Reveal are different objects and different actions.
- Buyer match card never shows seller identity, score internals, or B2B price.
- Capture is a conversation with the Agent, not a vehicle form wizard.
- No auto-commit to OWNED inventory.
- Privacy cues stay quiet; Signal Blue only on real network events.
- Hebrew copy already in product (`EMPTY_COPY`, brand-copy) is reused, not rewritten “for mobile”.
- Few actions per screen; primary vs secondary as on Web.

---

## C. Platform-native adaptation

| Concern | iOS | Android |
|---|---|---|
| Root nav | TabView | NavigationBar |
| Back | edge swipe / chevron | predictive back |
| Sheets | `.sheet` / confirmationDialog | ModalBottomSheet |
| Permissions | system dialogs | system dialogs + rationale once |
| Keyboard | safeArea + focused field | imePadding |
| Share-in | Share Extension (later) | intent ACTION_SEND (later) |
| Haptics | light on match | optional; do not spam |

Mobile is not a desktop sidebar stacked vertically. Information hierarchy of Home V2 (attention before KPIs) is preserved.

---

## Components (conceptual)

Buttons: primary (gold or signal per existing v2 ButtonV2 usage — **do not invent a third accent**), secondary, ghost, destructive.  
Cards: Surface raised; Match card STRONG uses MATCH label + mark — no fake scores.  
Inputs: 48h, error uses `color.semantic.error`.  
Badges: verification, freshness Hebrew labels (מעודכן / דורש רענון / …).  
Empty: `EMPTY_COPY`.  
Skeleton: brand-v2 ActionCard loading.  
Dialogs: confirm sold/archive — inline on Web; native confirmation dialog is an allowed adaptation.

---

## RTL / Hebrew (Definition of Done for every screen)

- Layout RTL; chevrons mirrored.
- Mixed Hebrew + English vehicle models: LTR isolate on the model string.
- Numbers and ₪: locale `he_IL`.
- Phone: LTR.
- License plates: LTR, no hyphen tricks that break VoiceOver.
- Truncation: 2 lines max on cards; detail shows full.
- Dynamic Type: no clipped CTAs.

---

## Accessibility baseline (not P3)

- VoiceOver / TalkBack labels on Mark, nav items, match actions (מעוניין / דחייה).
- Contrast: platinum on midnight meets WCAG for body text (verify gold-on-midnight for large titles only).
- Loading/error announced.
- Touch targets ≥ 44pt / 48dp.
