/**
 * Dealer Memory Production QA.
 * Asserts persistence/retrieval/supersede/forget via chat meta + tool side effects.
 * Does NOT require recommendation flips.
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

function requireQa(condition: unknown, message: string) {
  if (!condition) throw new Error(`MEMORY QA FAILED: ${message}`);
}

async function login() {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  requireQa(csrf.ok, `csrf ${csrf.status}`);
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
  requireQa(cookies.includes("session-token"), `login ${response.status}`);
  return cookies;
}

async function chat(cookies: string, message: string, conversation: Json = {}) {
  const started = Date.now();
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
  return { status: response.status, body, elapsedMs: Date.now() - started };
}

async function ensureDealerMemoryConsent(cookies: string) {
  // Privacy & AI v1: optional DEALER_MEMORY defaults false — enable for this suite.
  const status = await fetch(`${BASE}/api/privacy/status`, {
    headers: { Cookie: cookies },
  });
  requireQa(status.ok, `privacy status ${status.status}`);
  const statusBody = (await status.json()) as Json;
  if (!statusBody.hasCompletedPrivacyAiV1) {
    const complete = await fetch(`${BASE}/api/privacy/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({
        consents: {
          DEALER_MEMORY: true,
          AGENT_TO_EXCHANGE_LEARNING: false,
          EXCHANGE_ACTIVITY_LEARNING: false,
          EXTERNAL_ACTIVITY_LEARNING: false,
        },
      }),
    });
    requireQa(complete.ok, `privacy onboarding ${complete.status}`);
    console.log("PRIVACY onboarding completed (DEALER_MEMORY=true for memory QA)");
    return;
  }
  if (statusBody.consents?.DEALER_MEMORY !== true) {
    const patch = await fetch(`${BASE}/api/privacy/consents`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({
        consentType: "DEALER_MEMORY",
        value: true,
        source: "dealer_memory_qa",
      }),
    });
    requireQa(patch.ok, `enable DEALER_MEMORY ${patch.status}`);
    console.log("DEALER_MEMORY consent enabled for memory QA");
  } else {
    console.log("DEALER_MEMORY consent already ON");
  }
}

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as Json;
  console.log(`HEALTH ${JSON.stringify(health)}`);
  const cookies = await login();
  console.log("LOGIN OK");
  await ensureDealerMemoryConsent(cookies);

  let conversation: Json = {};

  const learn = await chat(
    cookies,
    "תזכור לעתיד: החודש הכי חשוב לי תזרים. אני מוכן לוותר קצת על מרווח בשביל להזיז רכבים מהר. שמור את זה כהעדפה עסקית מתמשכת.",
    conversation
  );
  requireQa(learn.status === 200, `learn HTTP ${learn.status}`);
  console.log(`TURN LEARN tools=${JSON.stringify(learn.body.meta?.tools)}`);
  console.log(`ASSISTANT ${String(learn.body.message ?? "").slice(0, 500)}`);
  requireQa(
    learn.body.meta?.tools?.includes("remember_dealer_insight") ||
      (learn.body.meta?.memory?.mutationCount ?? 0) > 0,
    "learn did not persist memory via remember_dealer_insight"
  );
  conversation = learn.body.conversation ?? {};

  // Fresh conversation object — memory must survive without prior turns.
  const fresh: Json = {};
  const advise = await chat(
    cookies,
    "יש לי שתי אפשרויות דומות: אחת מהירה עם פחות רווח ואחת איטית עם יותר רווח. מה היית שוקל קודם לפי מה שאתה יודע עלי?",
    fresh
  );
  requireQa(advise.status === 200, `advise HTTP ${advise.status}`);
  console.log(
    `TURN ADVISE memory=${JSON.stringify(advise.body.meta?.memory)} tools=${JSON.stringify(advise.body.meta?.tools)}`
  );
  requireQa(
    (advise.body.meta?.memory?.retrievedCount ?? 0) > 0 ||
      advise.body.meta?.tools?.includes("get_my_dealer_memory"),
    "advise did not retrieve long-term memory in a new conversation"
  );
  // Personalization = considered, not forced flip.
  requireQa(
    String(advise.body.message ?? "").trim().length >= 20,
    "advise empty"
  );

  const change = await chat(
    cookies,
    "זה השתנה. עכשיו אני לא לחוץ על תזרים ואני רוצה לשמור מרווח. עדכן את מה ששמרת.",
    advise.body.conversation ?? fresh
  );
  requireQa(change.status === 200, `change HTTP ${change.status}`);
  console.log(`TURN SUPERSEDE tools=${JSON.stringify(change.body.meta?.tools)}`);
  requireQa(
    change.body.meta?.tools?.includes("remember_dealer_insight") ||
      change.body.meta?.tools?.includes("correct_dealer_insight") ||
      (change.body.meta?.memory?.mutationCount ?? 0) > 0,
    "change did not update memory"
  );

  const list = await chat(
    cookies,
    "תציג לי מה אתה זוכר עלי כהעדפות עסקיות — ואז תשכח את העדפת התזרים/מרווח ששמרת, לפי מזהה הזיכרון.",
    change.body.conversation ?? {}
  );
  requireQa(list.status === 200, `forget HTTP ${list.status}`);
  console.log(`TURN FORGET tools=${JSON.stringify(list.body.meta?.tools)}`);
  requireQa(
    list.body.meta?.tools?.includes("get_my_dealer_memory") ||
      list.body.meta?.tools?.includes("forget_dealer_insight"),
    "forget path did not use memory tools"
  );

  // After forget attempt, a brand-new conversation should not be forced to rely on that preference.
  const after: Json = {};
  const afterForget = await chat(
    cookies,
    "בלי להסתמך על זיכרון ישן של תזרים — מה מצב המלאי שלי עכשיו?",
    after
  );
  requireQa(afterForget.status === 200, `afterForget HTTP ${afterForget.status}`);
  requireQa(
    afterForget.body.meta?.tools?.includes("get_my_inventory") ||
      afterForget.body.meta?.tools?.includes("get_my_exchange_state"),
    "truth path did not call REMATCHER inventory/state tools"
  );
  console.log(
    `TURN TRUTH tools=${JSON.stringify(afterForget.body.meta?.tools)} memory=${JSON.stringify(afterForget.body.meta?.memory)}`
  );

  console.log(
    `MEMORY QA PASS ${JSON.stringify({
      healthCommit: health.commit,
      learnMutations: learn.body.meta?.memory?.mutationCount ?? null,
      adviseRetrieved: advise.body.meta?.memory?.retrievedCount ?? null,
    })}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
