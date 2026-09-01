# Visual QA Checklist — REMATCHER Exchange

Run against **https://exchange.rematcher.co.il** after production deployment (HTTPS).

> Vercel URL (`rematcher-exchange.vercel.app`) — deployment/debug only, not default QA.

## Viewports

| Viewport | Width |
|----------|-------|
| Mobile | 390px |
| Desktop | 1440px |

## Screens to capture

### Mobile (390px)
- [ ] Login
- [ ] Home
- [ ] Inventory
- [ ] Demand
- [ ] Match
- [ ] Validation
- [ ] Opportunity
- [ ] Activity
- [ ] Reveal
- [ ] Outcome
- [ ] Account / Usage

### Desktop (1440px)
- [ ] Home
- [ ] Inventory
- [ ] Demand
- [ ] Matches
- [ ] Opportunities
- [ ] Reveal
- [ ] Admin

## Product checks

- [ ] Not marketplace aesthetic
- [ ] Not CRM / AI SaaS aesthetic
- [ ] Signal Green used sparingly
- [ ] RTL + mixed Hebrew/English readable
- [ ] Reveal = moment of value (no celebration)
- [ ] Privacy presentation correct pre/post Reveal

Save screenshots to `docs/visual-qa/screenshots/` after deployment.
