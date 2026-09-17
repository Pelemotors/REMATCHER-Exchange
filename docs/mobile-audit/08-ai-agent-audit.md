# 08 — AI / Agent Audit

Agent version ב-health: **4.1**.  
כניסה HTTP: `POST /api/assistant/chat`, `GET /api/assistant/context`.  
אורקסטרציה: `src/services/assistant/v2-orchestrator.ts`, `agent-loop.ts`.

## Endpoints ומודלים

| שימוש | כניסה | מודל (ברירת מחדל / env) |
|--------|--------|-------------------------|
| Agent loop | `/api/assistant/chat` | `gpt-5.4-mini` (`product.ts`) |
| Demand parse | `/api/demands/parse` | `OPENAI_DEMAND_PARSER_MODEL` / gpt-4o-mini |
| Inventory normalizer | import preview / tools | `OPENAI_INVENTORY_NORMALIZER_MODEL` |
| Match explainer | matching (אופציונלי) | `OPENAI_MATCH_EXPLAINER_MODEL` |
| Plate OCR / vision | intake process-batch | `OPENAI_PLATE_OCR_MODEL` |

Auth: `requireVerifiedDealer` על ה-chat.

## Prompts

- `AGENT_CONSTITUTION` — `src/services/assistant/agent-constitution.ts`
- `PRIVACY_CONSTITUTION` — `docs/agent/PRIVACY_CONSTITUTION.md`
- Demand parser system prompt — `src/services/ai/demand-parser.ts`
- גרסאות: `AI_PROMPT_VERSIONS` ב-`src/config/product.ts`

## Tools

Read: מלאי/התאמות/הזדמנויות/reveals/intake/memory/search diagnostics — כולם **dealer-scoped**.

Write: `propose_mutation` → **Action Gateway** + `pendingConfirmation`. אין כתיבה חופשית מהמודל ל-DB.

אסורים מתועדים ב-`docs/agent/TOOL_POLICY.md`: חיפוש מלאי כל הרשת, forceReveal, זהות לפני reveal.

## מה נשלח למודל

- הודעת המשתמש
- recentTurns (עד ~12) מ-`DealerMemoryItem`
- זיכרון סוחר אם consent `DEALER_MEMORY`
- תוצאות כלים ב-DTO (buyer view וכו')
- סיכום entitlement

לא אמור להישלח: מלאי סוחר אחר, זהות נגדית לפני reveal, b2bPrice ב-buyer tools.

תמונות intake ל-OCR/vision הן payload נפרד, לא דרך ה-chat הרגיל.

## אחסון שיחה

אין טבלת Message. מצב ב-`DealerMemoryItem` (`agent_conversation_state_v1`).  
מחיקה: Privacy Center / account deletion (memory).

## ולידציה דטרמיניסטית אחרי AI

- Privacy gate regex לפני מודל (`privacy-gate.ts`)
- Demand: schema + sanitize + fallback
- Matching: `engine-v2.ts` — hard gates לא מהמודל
- כתיבות: Action Gateway + אישור משתמש
- Memory persist: `mayPersistDealerMemory()`

Timeouts: `AGENT_LOOP_DEADLINE_MS=45000`, max 4 rounds, 6 tools/round.  
לוג: `AiOperationLog` (usage/latency, לא prompt מלא).

## האם AI מקור סמכות?

| נושא | AI מחליט? | מי כן |
|------|-----------|--------|
| Privacy consents | לא | policy.ts + UI/API |
| Reveal | לא | reveal-flow אחרי mutual |
| Hard constraints matching | לא | engine-v2 |
| Mutual interest | לא | recordBuyer/SellerInterest |
| Permissions / dealer isolation | לא | auth-guards + where |
| Commercial / entitlement | לא | entitlements + canDealerReveal |
| MATCHES/REVEALS ב-Action Gateway | enum קיים, **לא מטופל** | נופל לסירוב בטוח |

**מסקנה:** ה-Agent הוא ממשק שפה מעל APIs דטרמיניסטיים, לא סמכות. זה KEEP למובייל, בתנאי שהקליינט החדש לא יוסיף "המודל אמר אז תחשוף".
