/**
 * Judgment evaluation — non-blocking for CI.
 * Scores conversational quality; exits 0 unless infrastructure fails.
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

async function chat(cookies: string, message: string, conversation: Json) {
  const response = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      message,
      context: { route: "/home" },
      conversation,
    }),
  });
  const body = (await response.json()) as Json;
  return { status: response.status, body };
}

type Score = { label: string; pass: boolean; note: string };

function scoreTurn(label: string, status: number, answer: string, body: Json): Score[] {
  const scores: Score[] = [];
  scores.push({
    label: `${label}.http`,
    pass: status === 200,
    note: `status=${status}`,
  });
  scores.push({
    label: `${label}.nonempty`,
    pass: answer.trim().length >= 8,
    note: `len=${answer.trim().length}`,
  });
  scores.push({
    label: `${label}.no_impl_leak`,
    pass: !/get_my_|tool_call|prompt version/i.test(answer),
    note: "implementation jargon",
  });
  if (["BROAD", "DO_NOW", "MISSING"].includes(label)) {
    scores.push({
      label: `${label}.not_capability_menu`,
      pass: !/(?:אני יכול|אפשר) לעזור[^.]{0,60}(?:ב)?(?:מלאי|חיפוש|התאמ)[^.]{0,40}או[^.]{0,40}(?:חיפוש|התאמ|מלאי|הזדמנ)/.test(
        answer
      ),
      note: "capability menu pattern",
    });
  }
  if (label === "CHALLENGE") {
    const usedInventory = Boolean(body.meta?.tools?.includes("get_my_inventory"));
    const mentionsInventory =
      /מאזדה|מלאי|רכב/.test(answer) && !/אם אין לך בכלל מלאי, אז/.test(answer);
    scores.push({
      label: `${label}.verified_or_rechecked`,
      pass: usedInventory || mentionsInventory,
      note: `tools=${JSON.stringify(body.meta?.tools ?? [])}`,
    });
  }
  return scores;
}

async function main() {
  const cookies = await login();
  let conversation: Json = {};
  const turns: Array<[string, string]> = [
    ["BROAD", "ממה כדאי לי להתחיל?"],
    ["DO_NOW", "מה היית עושה עכשיו?"],
    ["MISSING", "מה אני מפספס כרגע?"],
    ["NO_TASK", "ואם באמת אין משהו שצריך לעשות עכשיו, תגיד לי ולא תמציא משימה."],
    ["CHALLENGE", "אבל אין לי בכלל מלאי"],
    ["DISAGREE", "נראה לי שאני צריך להכניס עכשיו עוד 30 רכבים בלי קשר למצב"],
    ["MARKET_FACT", "איזה רכב הכי חם עכשיו בישראל? תן תשובה כעובדה מדויקת."],
  ];

  const all: Score[] = [];
  for (const [label, message] of turns) {
    const { status, body } = await chat(cookies, message, conversation);
    const answer = String(body.message ?? "");
    console.log(`TURN ${label}`);
    console.log(`ASSISTANT ${answer.slice(0, 400)}${answer.length > 400 ? "…" : ""}`);
    console.log(
      `META ${JSON.stringify({
        tools: body.meta?.tools,
        finalResponseSource: body.meta?.finalResponseSource,
        totalTokens: body.meta?.totalTokens,
        memory: body.meta?.memory,
      })}`
    );
    all.push(...scoreTurn(label, status, answer, body));
    if (body.conversation) conversation = body.conversation;
  }

  const passed = all.filter((s) => s.pass).length;
  const failed = all.filter((s) => !s.pass);
  console.log(
    `JUDGMENT SUMMARY ${JSON.stringify({
      passed,
      total: all.length,
      score: Number((passed / all.length).toFixed(3)),
      warnings: failed.map((f) => ({ label: f.label, note: f.note })),
    })}`
  );
  console.log("JUDGMENT EVAL COMPLETE (non-blocking)");
}

main().catch((err) => {
  console.error(err);
  // Infrastructure failure still exits non-zero so CI can see login/network breaks.
  process.exit(1);
});
