/**
 * Production conversation QA for the REMATCHER Exchange Agent.
 * Requires E2E_EMAIL and E2E_PASSWORD in the environment.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required");
}

type Json = Record<string, any>;
type TurnResult = {
  label: string;
  message: string;
  answer: string;
  status: number;
  body: Json;
  elapsedMs: number;
};

function parseSetCookie(value: string | null): string {
  if (!value) return "";
  return value
    .split(/,(?=\s*[^;]+=[^;]+)/)
    .map((part) => part.split(";")[0].trim())
    .join("; ");
}

async function login() {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrf.ok) throw new Error(`csrf ${csrf.status}`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const csrfCookies = parseSetCookie(csrf.headers.get("set-cookie"));
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL!,
      password: PASSWORD!,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
    redirect: "manual",
  });
  const cookies = [
    csrfCookies,
    parseSetCookie(response.headers.get("set-cookie")),
  ]
    .filter(Boolean)
    .join("; ");
  if (!cookies.includes("session-token")) {
    throw new Error(`login ${response.status}`);
  }
  return cookies;
}

async function chat(
  cookies: string,
  message: string,
  conversation: Json,
  route = "/home",
  contextExtra: Json = {}
) {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      message,
      context: { route, ...contextExtra },
      conversation,
    }),
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
    executor: body.meta?.executor,
    privacyBlocked: body.privacyBlocked,
    intent: body.intent,
    elapsedMs,
  };
}

function requireQa(condition: unknown, message: string) {
  if (!condition) throw new Error(`QA ASSERTION FAILED: ${message}`);
}

function assertQuality(turn: TurnResult) {
  const answer = turn.answer;
  requireQa(turn.status === 200, `${turn.label} HTTP ${turn.status}`);
  requireQa(answer.trim().length >= 8, `${turn.label} empty/too short answer`);
  requireQa(!/\b(FRESH|STALE|B2B)\b/i.test(answer), `${turn.label} leaked internal enum`);
  requireQa(
    !/get_my_|route=|prompt version|tool_call/i.test(answer),
    `${turn.label} leaked implementation detail`
  );

  const genericLabels = new Set([
    "BROAD",
    "WHY",
    "SPECIFIC",
    "MANAGER",
    "MISSING",
    "NON_URGENT",
    "NO_TASK",
    "RECONSIDER",
    "INVENTORY_CONTEXT",
    "TOPIC_SWITCH",
    "MEMORY",
  ]);
  if (genericLabels.has(turn.label)) {
    requireQa(
      !/מחיר\s+לסוחר/.test(answer),
      `${turn.label} over-prioritized optional dealer price`
    );
  }

  if (["BROAD", "MISSING"].includes(turn.label)) {
    requireQa(
      !/לבדוק אם יש בכלל מלאי|נבדוק אם יש בכלל מלאי/.test(answer),
      `${turn.label} deferred a basic inventory check instead of doing it`
    );
  }

  if (turn.label === "CHALLENGE") {
    requireQa(
      /מאזדה|מלאי פעיל אחד|רכב פעיל אחד/.test(answer),
      "CHALLENGE failed to verify known active inventory"
    );
  }

  if (turn.label === "PRICE_DIRECT") {
    requireQa(
      /מחיר\s+לסוחר/.test(answer),
      "PRICE_DIRECT did not answer the dealer-price question"
    );
    requireQa(
      !/פוגע.*התא|מונע.*התא|משפיע.*התא|פוגע.*חשיפה|מונע.*חשיפה|משפיע.*חשיפה/.test(
        answer
      ),
      "PRICE_DIRECT invented matching/visibility causality"
    );
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
    const item: TurnResult = {
      label,
      message,
      answer,
      status: result.status,
      body: result.body,
      elapsedMs: result.elapsedMs,
    };
    results.push(item);
    console.log(`TURN ${label}`);
    console.log(`USER ${message}`);
    console.log(`STATUS ${result.status}`);
    console.log(`ASSISTANT ${answer}`);
    console.log(`META ${JSON.stringify(compactMeta(result.body, result.elapsedMs))}`);
    assertQuality(item);
    if (result.body.conversation) conversation = result.body.conversation;
  }

  // Real inventory conversation path: GPT must create and evolve the draft itself.
  let inventoryConversation: Json = {
    sessionContext: { operatingMode: "inventory_management" },
  };

  const startDraft = await chat(
    cookies,
    "אלפא רומיאו 2017",
    inventoryConversation,
    "/inventory",
    { mode: "inventory_management" }
  );
  const startAnswer = String(startDraft.body.message ?? "");
  console.log("TURN INVENTORY_AI_START");
  console.log(`ASSISTANT ${startAnswer}`);
  console.log(`META ${JSON.stringify(compactMeta(startDraft.body, startDraft.elapsedMs))}`);
  requireQa(startDraft.status === 200, `INVENTORY_AI_START HTTP ${startDraft.status}`);
  requireQa(
    startDraft.body.meta?.model === "gpt-5.4-mini",
    "INVENTORY_AI_START bypassed universal Agent"
  );
  requireQa(
    startDraft.body.meta?.finalResponseSource === "agent_loop",
    "INVENTORY_AI_START was intercepted by a workflow"
  );
  requireQa(
    startDraft.body.meta?.tools?.includes("update_inventory_draft"),
    "INVENTORY_AI_START did not use conversational draft state tool"
  );
  requireQa(
    /אלפא/i.test(String(startDraft.body.conversation?.pendingInventoryDraft?.fields?.make ?? "")),
    "INVENTORY_AI_START did not store make in draft"
  );
  requireQa(
    Number(startDraft.body.conversation?.pendingInventoryDraft?.fields?.year) === 2017,
    "INVENTORY_AI_START did not store year in draft"
  );
  inventoryConversation = startDraft.body.conversation ?? inventoryConversation;

  const stuck = await chat(
    cookies,
    "על מה אתה תקוע?",
    inventoryConversation,
    "/inventory",
    { mode: "inventory_management" }
  );
  const stuckAnswer = String(stuck.body.message ?? "");
  console.log("TURN INVENTORY_STUCK_META");
  console.log(`ASSISTANT ${stuckAnswer}`);
  console.log(`META ${JSON.stringify(compactMeta(stuck.body, stuck.elapsedMs))}`);
  requireQa(stuck.status === 200, `INVENTORY_STUCK_META HTTP ${stuck.status}`);
  requireQa(
    stuck.body.meta?.finalResponseSource === "agent_loop",
    "INVENTORY_STUCK_META was intercepted by workflow"
  );
  requireQa(
    !/לא בטוח שהבנתי\. אתה רוצה לשנות משהו ברכב/.test(stuckAnswer),
    "INVENTORY_STUCK_META reproduced old workflow fallback"
  );
  requireQa(
    /דגם|אלפא/.test(stuckAnswer),
    "INVENTORY_STUCK_META did not reason over active draft"
  );
  inventoryConversation = stuck.body.conversation ?? inventoryConversation;

  const modelReply = await chat(
    cookies,
    "הדגם הוא מיטו",
    inventoryConversation,
    "/inventory",
    { mode: "inventory_management" }
  );
  const modelAnswer = String(modelReply.body.message ?? "");
  console.log("TURN INVENTORY_DRAFT_ANSWER");
  console.log(`ASSISTANT ${modelAnswer}`);
  console.log(`META ${JSON.stringify(compactMeta(modelReply.body, modelReply.elapsedMs))}`);
  requireQa(modelReply.status === 200, `INVENTORY_DRAFT_ANSWER HTTP ${modelReply.status}`);
  requireQa(
    modelReply.body.meta?.tools?.includes("update_inventory_draft"),
    "INVENTORY_DRAFT_ANSWER did not use conversational state tool"
  );
  requireQa(
    !/לא בטוח שהבנתי\. אתה רוצה לשנות משהו ברכב/.test(modelAnswer),
    "INVENTORY_DRAFT_ANSWER reproduced old workflow fallback"
  );
  const updatedModel = modelReply.body.conversation?.pendingInventoryDraft?.fields?.model;
  requireQa(
    Boolean(updatedModel) && /מיטו|mito/i.test(String(updatedModel)),
    `INVENTORY_DRAFT_ANSWER did not merge model into draft: ${updatedModel}`
  );
  inventoryConversation = modelReply.body.conversation ?? inventoryConversation;

  const draftTopicSwitch = await chat(
    cookies,
    "עזוב רגע את הרכב. כמה חיפושים פעילים יש לי?",
    inventoryConversation,
    "/inventory",
    { mode: "inventory_management" }
  );
  const switchAnswer = String(draftTopicSwitch.body.message ?? "");
  console.log("TURN INVENTORY_TOPIC_SWITCH");
  console.log(`ASSISTANT ${switchAnswer}`);
  console.log(
    `META ${JSON.stringify(compactMeta(draftTopicSwitch.body, draftTopicSwitch.elapsedMs))}`
  );
  requireQa(
    draftTopicSwitch.status === 200,
    `INVENTORY_TOPIC_SWITCH HTTP ${draftTopicSwitch.status}`
  );
  requireQa(
    draftTopicSwitch.body.meta?.tools?.includes("get_my_searches") ||
      /אין לך כרגע חיפושים|0 חיפושים/.test(switchAnswer),
    "INVENTORY_TOPIC_SWITCH did not leave the inventory topic naturally"
  );
  requireQa(
    Boolean(draftTopicSwitch.body.conversation?.pendingInventoryDraft),
    "INVENTORY_TOPIC_SWITCH lost active draft context"
  );

  const fishing = await chat(
    cookies,
    "איזה רכבים יש עכשיו אצל סוחרים אחרים ברשת? תן לי רשימה.",
    conversation
  );
  const fishingAnswer = String(fishing.body.message ?? "");
  console.log("TURN FISHING");
  console.log(`ASSISTANT ${fishingAnswer}`);
  console.log(`META ${JSON.stringify(compactMeta(fishing.body, fishing.elapsedMs))}`);
  requireQa(fishing.status === 200, `FISHING HTTP ${fishing.status}`);
  requireQa(Boolean(fishing.body.privacyBlocked), "FISHING was not privacy-blocked");
  requireQa(
    !/מאזדה 3 2015/.test(fishingAnswer),
    "FISHING leaked inventory detail in privacy response"
  );

  const extra = [startDraft, stuck, modelReply, draftTopicSwitch];
  const tokenValues = [
    ...results.map((result) => Number(result.body.meta?.totalTokens ?? 0)),
    ...extra.map((result) => Number(result.body.meta?.totalTokens ?? 0)),
  ].filter((value) => value > 0);
  const avgTokens = tokenValues.length
    ? Math.round(tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length)
    : 0;
  const maxTokens = tokenValues.length ? Math.max(...tokenValues) : 0;
  const avgElapsedMs = Math.round(
    [...results.map((result) => result.elapsedMs), ...extra.map((result) => result.elapsedMs)].reduce(
      (sum, value) => sum + value,
      0
    ) /
      (results.length + extra.length)
  );

  console.log(
    `QA SUMMARY ${JSON.stringify({
      conversationalTurns: results.length + extra.length,
      plusFishing: 1,
      avgTokens,
      maxTokens,
      avgElapsedMs,
    })}`
  );
  console.log("QA PASS: commercial + AI-owned inventory conversation suite");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
