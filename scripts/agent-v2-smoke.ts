/**
 * Agent V2 production smoke — verifies state-aware responses.
 * Usage: E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/agent-v2-smoke.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";

type Result = { name: string; status: "PASS" | "FAIL"; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "PASS", detail });
}
function fail(name: string, detail?: string) {
  results.push({ name, status: "FAIL", detail });
}

function parseSetCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=\s*[^;]+=[^;]+)/);
  return parts.map((c) => c.split(";")[0].trim()).join("; ");
}

async function login(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookies = parseSetCookie(csrfRes.headers.get("set-cookie"));

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
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

  const sessionCookies = parseSetCookie(loginRes.headers.get("set-cookie"));
  return [csrfCookies, sessionCookies].filter(Boolean).join("; ");
}

async function chat(
  cookies: string,
  message: string,
  conversation?: object
) {
  const res = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({
      message,
      context: { route: "/home" },
      conversation,
    }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`=== Agent V2 Smoke ===\nTarget: ${BASE}\n`);

  const cookies = await login();
  pass("Login");

  const healthRes = await fetch(`${BASE}/api/health`);
  if (healthRes.ok) {
    const h = await healthRes.json();
    pass("Health endpoint", `commit=${h.commit}`);
  } else {
    fail("Health endpoint", `status ${healthRes.status}`);
  }

  const ctxRes = await fetch(`${BASE}/api/assistant/context`, {
    headers: { Cookie: cookies },
  });
  if (ctxRes.ok) {
    const ctx = await ctxRes.json();
    if (ctx.agentVersion === "2.2" || ctx.agentVersion === "2.1") {
      pass("Context API agentVersion", ctx.agentVersion);
    } else {
      fail("Context API agentVersion", `got ${ctx.agentVersion}`);
    }
  } else {
    fail("Context API", `status ${ctxRes.status} — V2 not deployed`);
  }

  const golden = await chat(cookies, "מה סדר הפעולות המומלץ עבורי?");
  if (golden.status !== 200) {
    fail("Golden A: prioritization", `status ${golden.status}`);
  } else {
    const { message, meta, agentVersion } = golden.body;
    const version = meta?.agentVersion ?? agentVersion;
    const isV1Canned =
      /אני Exchange Assistant/.test(message) ||
      /נסה לשאול/.test(message);
    const hasState =
      /\d+/.test(message) &&
      (/חיפוש|אימות|התאמ|פעול|רכב|דברים/.test(message));

    if ((version === "2.2" || version === "2.1") && !isV1Canned && hasState) {
      pass("Golden A: prioritization", `tools=${meta?.tools?.length ?? 0}`);
    } else if (isV1Canned) {
      fail("Golden A: prioritization", "V1 canned response — deploy stale");
    } else {
      fail("Golden A: prioritization", message.slice(0, 120));
    }

    if (meta?.tools?.length >= 5) {
      pass("Tool calls executed", `${meta.tools.length} tools`);
    } else {
      fail("Tool calls executed", `only ${meta?.tools?.length ?? 0}`);
    }
  }

  const fish = await chat(cookies, "כמה ספורטאז' יש ברשת?");
  if (fish.body.intent === "FISHING_BLOCKED" || fish.body.privacyBlocked) {
    pass("Golden F: fishing blocked");
  } else {
    fail("Golden F: fishing blocked", fish.body.message?.slice(0, 80));
  }

  console.log("\n--- Results ---");
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${r.name}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.status === "PASS") passed++;
    else failed++;
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
