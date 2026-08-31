# REMATCHER — Brand System v1 (LOCKED)

> **The Signal is the hero.** Neutral UI by default; Exchange Signal (`#18C37E`) marks actionable value only.

## Implementation Map

| Layer | Location |
|-------|----------|
| Token source of truth | `src/config/brand.ts` |
| CSS variables | `src/app/globals.css` (`--rm-*`) |
| Tailwind theme | `tailwind.config.ts` |
| Wordmark (temporary) | `src/components/brand/brand-wordmark.tsx` |
| App icon (temporary) | `public/icons/icon.svg` — `BRAND_ASSET_TEMPORARY` |

## LOCKED Colors

| Token | Hex | Use |
|-------|-----|-----|
| Midnight | `#0B1220` | Sidebar, headers, premium surfaces |
| Ink | `#111827` | Primary text |
| Exchange Signal | `#18C37E` | CTA, active nav, strong match |
| Signal Hover | `#12A96D` | Button hover |
| Signal Soft | `#E8F8F1` | Badges, subtle highlights |
| Canvas | `#F6F8FA` | App background |
| Surface | `#FFFFFF` | Cards |

Semantic: Success `#16865C`, Warning `#C47A12`, Error `#C53B3B`, Info `#3478C9`

## Typography

Heebo · weights 400/500/600/700 · scale in `TOKENS.typography`

## Rules (Do Not)

- No gamified scores, progress circles, rainbow meters
- No gradient-heavy / purple AI aesthetic / confetti on Reveal
- No emoji in core UI
- Signal green sparingly — not half the screen

## Match Language

| Internal | User-facing |
|----------|-------------|
| STRONG | התאמה גבוהה |
| ALTERNATIVE | התאמה אפשרית (+ gap note) |

## Temporary Assets

Wordmark and app icon in code are **BRAND_ASSET_TEMPORARY** — not final logo.

Full product spec: see product documentation §1–55 (Brand System v1).
