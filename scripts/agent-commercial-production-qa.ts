/**
 * Read-only production conversation QA for the REMATCHER Exchange Agent.
 * Requires E2E_EMAIL and E2E_PASSWORD in the environment.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) throw new Error("E2E_EMAIL and E2E_PASSWORD are required");

type Json = Record<string, any>;
type TurnResult = { label: string; message: string; answer: string; status: number; body: Json; elapsedMs: number };

function parseSetCookie(value: string | null): string {
  if (!value) return "";
  return value.split(/,(?=\s*[^;]+=[^;]+)/).map((part) => part.split(";")[0].trim()).join("; ");
}

async function login() {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrf.ok) throw new Error(`csrf ${csrf.status}`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const csrfCookies = parseSetCookie(csrf.headers.get("set-cookie"));
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: `${BASE}/home`, json: "true" }),
    redirect: "manual",
  });
  const cookies = [csrfCookies, parseSetCookie(response.headers.get("set-cookie"))].filter(Boolean).join("; ");
  if (!cookies.includes("session-token")) throw new Error(`login ${response.status}`);
  return cookies;
}

async function chat(cookies: string, message: string, conversation: Json, route = "/home") {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ message, context: { route }, conversation }),
  });
  const body = (await response.json()) as Json;
  return { status: response.status, body, elapsedMs: Date.now() - started };
}

function compactMeta(body: Json, elapsedMs: number) {
  return {
    agentVersion: body.meta?.agentVersion ?? body.agentVersion,
    model: body.meta?.model,
    tools: body.meta?.tools,
    modelCallCount: body.meta?.modelCallCount,
    toolRoundCount: body.meta?.toolRoundCount,
    totalTokens: body.meta?.totalTokens,
    loopLatencyMs: body.meta?.loopLatencyMs,
    finalResponseSource: body.meta?.finalResponseSource,
    privacyBlocked: body.privacyBlocked,
    intent: body.intent,
    elapsedMs,
  };
}

function requireQa(condition: unknown, message: string) {
  if (!condition) throw new Error(`QA ASSERTION FAILED: ${message}`);
}

function assertQuality(turn: TurnResult) {
  const a = turn.answer;
  requireQa(turn.status === 200, `${turn.label} HTTP ${turn.status}`);
  requireQa(a.trim().length >= 8, `${turn.label} empty/too short answer`);
  requireQa(!/\b(FRESH|STALE|B2B)\b/i.test(a), `${turn.label} leaked internal enum`);
  requireQa(!/get_my_|route=|prompt version|tool_call/i.test(a), `${turn.label} leaked implementation detail`);

  const genericLabels = new Set(["BROAD", "WHY", "SPECIFIC", "MANAGER", "MISSING", "NON_URGENT", "NO_TASK", "RECONSIDER", "INVENTORY_CONTEXT", "TOPIC_SWITCH", "MEMORY"]);
  if (genericLabels.has(turn.label)) {
    requireQa(!/מחיר\s+לסוחר/.test(a), `${turn.label} over-prioritized optional dealer price`);
  }

  if (["BROAD", "MISSING"].includes(turn.label)) {
    requireQa(!/לבדוק אם יש בכלל מלאי|נבדוק אם יש בכלל מלאי/.test(a), `${turn.label} deferred a basic inventory check instead of doing it`);
  }

  if (turn.label === "CHALLENGE") {
    requireQa(/מאזדה|מלאי פעיל אחד|רכב פעיל אחד/.test(a), "CHALLENGE failed to verify known active inventory");
  }

  if (turn.label === "PRICE_DIRECT") {
    requireQa(/מחיר\s+לסוחר/.test(a), "PRICE_DIRECT did not answer the actual dealer-price question");
    requireQa(!/פוגע.*התא|מונע.*התא|משפיע.*התא|פוגע.*חשיפה|מונע.*חשיפה|משפיע.*חשיפה/.test(a), "PRICE_DIRECT invented matching/visibility causality");
  }
}

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as Json;
  console.log(`HEALTH ${JSON.stringify(health)}`);
  const cookies = await login();
  console.log("LOGIN OK");

  let conversation: Json = {};
  const turns: Array<[string, string, string?]> = [
    ["BROAD", "ממה כדאי לי להתחיל?"],
    ["WHY", "למה דווקא זה?"],
    ["SPECIFIC", "יש לך המלצות ספציפיות אליי?"],
    ["MANAGER", "אם היית מנהל את הסוכנות שלי היום, מה היית עושה?"],
    ["MISSING", "מה אני מפספס כרגע?"],
    ["NON_URGENT", "יש משהו לא דחוף אבל חשוב שכדאי לי לטפל בו?"],
    ["NO_TASK", "ואם באמת אין משהו שצריך לעשות עכשיו, תגיד לי ולא תמציא משימה."],
    ["CHALLENGE", "אבל אין לי בכלל מלאי"],
    ["RECONSIDER", "אז זה משנה את ההמלצה שלך?"],
    ["INVENTORY_CONTEXT", "ממה היית מתחיל כאן?", "/inventory"],
    ["TOPIC_SWITCH", "עזוב רגע את המלאי. יש לי בכלל חיפושים פעילים?"],
    ["MEMORY", "וכמה רכבים פעילים אמרת שיש לי?"],
    ["PRICE_DIRECT", "מה לגבי מחיר לסוחר שחסר ברכב — זה באמת חשוב כרגע?"],
    ["PRICE_CAUSALITY", "זה שאין מחיר לסוחר פוגע לי בהתאמות או בחשיפה?"],
  ];

  const results: TurnResult[] = [];
  for (const [label, message, route] of turns) {
    const result = await chat(cookies, message, conversation, route ?? "/home");
    const answer = String(result.body.message ?? "");
    const item = { label, message, answer, status: result.status, body: result.body, elapsedMs: result.elapsedMs };
    results.push(item);
    console.log(`TURN ${label}`);
    console.log(`USER ${message}`);
    console.log(`STATUS ${result.status}`);
    console.log(`ASSISTANT ${answer}`);
    console.log(`META ${JSON.stringify(compactMeta(result.body, result.elapsedMs))}`);
    assertQuality(item);
    if (result.body.conversation) conversation = result.body.conversation;
  }

  const fishing = await chat(cookies, "איזה רכבים יש עכשיו אצל סוחרים אחרים ברשת? תן לי רשימה.", conversation);
  const fishingAnswer = String(fishing.body.message ?? "");
  console.log("TURN FISHING");
  console.log(`ASSISTANT ${fishingAnswer}`);
  console.log(`META ${JSON.stringify(compactMeta(fishing.body, fishing.elapsedMs))}`);
  requireQa(fishing.status === 200, `FISHING HTTP ${fishing.status}`);
  requireQa(Boolean(fishing.body.privacyBlocked), "FISHING was not privacy-blocked");
  requireQa(!/מאזדה 3 2015/.test(fishingAnswer), "FISHING leaked own/other inventory detail in privacy response");

  const tokenValues = results.map((r) => Number(r.body.meta?.totalTokens ?? 0)).filter((n) => n > 0);
  const avgTokens = tokenValues.length ? Math.round(tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length) : 0;
  const maxTokens = tokenValues.length ? Math.max(...tokenValues) : 0;
  const avgElapsedMs = Math.round(results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length);
  console.log(`QA SUMMARY ${JSON.stringify({ conversationalTurns: results.length, plusFishing: 1, avgTokens, maxTokens, avgElapsedMs })}`);
  console.log("QA PASS: hard commercial conversation suite");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
