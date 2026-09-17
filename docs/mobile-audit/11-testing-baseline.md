# 11 — Testing Baseline

רץ ב-2026-09-17 על `/srv/gal/rematcher-exchange/app` ב-SHA `6e1eda818b0daf567785953aa656711569f62179`.  
**אין Playwright ב-`npm test`.** אין deploy בביקורת זו.

## Vitest (`npm test`)

```
Test Files  77 passed (77)
Tests       802 passed | 5 skipped (807)
Duration    ~3.1s
```

Skipped: 5 ב-`tests/intake-field-test-behavioral.test.ts` — `describe.runIf(isFieldTest)` כש-`FIELD_TEST` כבוי.

### כיסוי לפי דומיין (קירוב לפי קבצים)

| דומיין | דוגמאות קבצים | אופי |
|--------|----------------|------|
| Auth | `auth-routing`, `authorization`, `admin-session-separation`, `identity-hardening` | unit/integration |
| Privacy | `privacy-ai-v1-hard`, `catalog-public-privacy` | unit |
| Matching | `matching-engine-2.0`, `bilateral-connection-flow`, `candidate-policy` | unit |
| Agent | `agent-4-1-regression`, `assistant-v2`, `action` gates | unit |
| Intake | `intake-domain`, `intake-multi-vehicle-discovery`, `plate-ocr-result` | unit |
| Inventory/media | `vehicle-media-vnext`, `inventory-agent-draft` | unit |
| Catalog | `catalog`, `catalog-finance-rules` | unit |
| Push | `push-ux`, `notifications` | unit |
| Mobile UX | `pixel-faithful-dealer-ui`, `app-feel-polish`, `mobile-performance`, `deep-links-activation-resilience` | source assertions, לא device |
| Commercial | `commercial`, `price-semantics` | unit |

רוב הבדיקות הן קריאת מקור / לוגיקה טהורה. מעט מאוד DB אמיתי ב-Vitest.

## Playwright

| Config | תיקייה | יעד |
|--------|---------|-----|
| `playwright.config.ts` | `tests/browser` | מקומי / field-test |
| `playwright.live.config.ts` | `tests/e2e/live-*.spec.ts` | `https://exchange.rematcher.co.il` |

Live specs קיימים: pixel-faithful, authenticated dealer, live-prod-visual.  
**לא הורצו מחדש בביקורת זו** (אין שינוי קוד; אין צורך ב-session חי ל-Audit). הרצות קודמות על אותו קו מוצר תועדו תחת `docs/visual-evidence/`.

## Production build

פקודה: `NODE_ENV=production npx next build`  
תוצאה: **PASS**

- Compiled successfully
- Lint + types OK
- 135 static pages generated
- First Load JS shared ~103 kB
- Middleware 34.3 kB
- כניסות כבדות יחסית: `/demand` ~151 kB, `/home` ~149 kB, `/inventory` ~135 kB, `/intake/handoff` ~132 kB

Next מדווח 15.5.24 (resolved מ-`next` ^15.1.6).

## פערים למובייל

- אין בדיקות APNs/FCM
- אין contract tests OpenAPI
- אין הרצת Capacitor Android ב-CI של `npm test`
- E2E החי תלוי credentials של QA dealer
- 5 skips field-test זה מצב ידוע, לא כשל

## מסקנה

רגרסיית הדומיין יציבה (802).  
זה **לא** אישור ש-Store build יעבור — רק שה-Web backend/UI מתקמפלים והלוגיקה מכוסה ברמת unit.
