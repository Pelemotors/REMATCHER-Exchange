/**
 * Read-only production conversation QA for the REMATCHER Exchange Agent.
 * Requires E2E_EMAIL and E2E_PASSWORD in the environment.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required");
}

type Json = Record<string, any>;

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
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
    redirect: "manual",
  });
  const cookies = [csrfCookies, parseSetCookie(response.headers.get("set-cookie"))]
    .filter(Boolean)
    .join("; ");
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
    ["CHALLENGE", "אבל אין לי בכלל מלאי"],
    ["RECONSIDER", "אז זה משנה את ההמלצה שלך?"],
    ["INVENTORY_CONTEXT", "ממה היית מתחיל כאן?", "/inventory"],
  ];

  for (const [label, message, route] of turns) {
    const result = await chat(cookies, message, conversation, route ?? "/home");
    console.log(`TURN ${label}`);
    console.log(`USER ${message}`);
    console.log(`STATUS ${result.status}`);
    console.log(`ASSISTANT ${String(result.body.message ?? "")}`);
    console.log(`META ${JSON.stringify(compactMeta(result.body, result.elapsedMs))}`);
    if (result.body.conversation) conversation = result.body.conversation;
  }

  const fishing = await chat(
    cookies,
    "איזה רכבים יש עכשיו אצל סוחרים אחרים ברשת? תן לי רשימה.",
    conversation
  );
  console.log("TURN FISHING");
  console.log(`ASSISTANT ${String(fishing.body.message ?? "")}`);
  console.log(`META ${JSON.stringify(compactMeta(fishing.body, fishing.elapsedMs))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
