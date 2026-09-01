# REMATCHER — Brand System v2 (Proof Rollout)

> **Deep Navy × Platinum × Signal Blue** — Private Exchange visual identity.

## Status

| Version | Status |
|---------|--------|
| v1 (Signal Green) | Active globally — superseded in proof surfaces |
| v2 (Navy/Blue) | **Proof rollout** — scoped via `[data-brand-ui="2"]` |

## Implementation Map

| Layer | Location |
|-------|----------|
| v2 token source | `src/config/brand-v2.ts` |
| v1 tokens (unchanged) | `src/config/brand.ts` → `TOKENS` |
| Scoped CSS vars | `src/app/globals.css` → `[data-brand-ui="2"]` |
| Tailwind v2 colors | `tailwind.config.ts` → `v2-*` prefix |
| Exchange mark | `src/components/brand/exchange-mark.tsx` |
| Network viz | `src/components/brand/network-visualization.tsx` |
| v2 UI primitives | `src/components/ui/brand-v2/` |
| App icon | `public/icons/icon.svg` |

## v2 Core Colors

| Token | Hex | Use |
|-------|-----|-----|
| Midnight | `#070C14` | Deep background |
| Graphite | `#111A26` | Surfaces / nav |
| Deep Navy | `#163A5F` | Depth / selected |
| Exchange Blue | `#174A73` | Brand accent |
| Signal Blue | `#2D78A8` | Match / active / meaningful signal only |
| Platinum | `#C9CED3` | Mark secondary side |
| Warm White | `#F3F1EC` | Primary typography |

## Color Principle

**Nothing glows unless something happened.**

Signal Blue is reserved for: Match, active opportunity, new signal, selected state, connection.

Most of the UI at rest: Midnight / Graphite / Platinum / Warm White.

Green remains for genuine positive financial/status semantics only.

## Exchange Mark

Concept: `> ◆ <` — Supply and Demand converging.

States: `idle` | `searching` | `converging` | `matched`

Motion: CSS/SVG only. Respects `prefers-reduced-motion`.

## Proof Surfaces (v2 scoped)

| Surface | Component | Route |
|---------|-----------|-------|
| Landing Hero | `HeroV2` | `/` |
| Home | `HomeV2` | `/home` |
| Match card | `MatchCardV2` | `/matches` |
| Exchange mark | `ExchangeMark` | Hero, Home, Match, sidebar on `/home` |

All other routes remain v1 until visual review approval.

## Manual QA Checklist (Proof)

- [ ] `/` — Hero shows network viz (desktop), mark animation cycles
- [ ] `/` — Hero copy matches spec; no invented statistics
- [ ] `/home` — Opportunities outrank generic KPIs; dark v2 surface
- [ ] `/home` — Sidebar shows Exchange mark (desktop)
- [ ] `/matches` — STRONG match shows MATCH label + mark; no fake scores
- [ ] Mobile — network viz simplified; hierarchy preserved
- [ ] `prefers-reduced-motion` — animations disabled
- [ ] `/inventory`, `/demand` — still v1 (no regression)

## Rollout After Proof

1. Landing sections (auth, remaining sections)
2. AppShell full restyle
3. Inventory, Demand, Reveal, Agent
4. Admin, Settings, empty states
5. Remove v1 tokens + `data-brand-ui` scoping
