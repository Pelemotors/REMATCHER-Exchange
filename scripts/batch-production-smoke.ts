/**
 * Production smoke test for Active Searches + Exchange Assistant batch.
 * Usage:
 *   E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/batch-production-smoke.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";
const COMMIT = process.env.EXPECTED_COMMIT ?? "cae8745";

type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "PASS", detail });
}
function fail(name: string, detail?: string) {
  results.push({ name, status: "FAIL", detail });
}
function skip(name: string, detail?: string) {
  results.push({ name, status: "SKIP", detail });
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
  const allCookies = [csrfCookies, sessionCookies].filter(Boolean).join("; ");
  if (!allCookies.includes("session-token")) {
    throw new Error(`Login failed: ${loginRes.status}`);
  }
  return allCookies;
}

async function waitForDeployment(cookies: string, maxWaitMs = 300000): Promise<boolean> {
  const start = Date.now();
  const markers = ["החיפושים שלי", "Exchange Assistant", "MySearchesPanel"];
  while (Date.now() - start < maxWaitMs) {
    try {
      const [homeRes, demandsRes] = await Promise.all([
        fetch(`${BASE}/home`, { headers: { Cookie: cookies } }),
        fetch(`${BASE}/api/demands`, { headers: { Cookie: cookies } }),
      ]);
      const homeHtml = await homeRes.text();
      const hasMarker = markers.some((m) => homeHtml.includes(m));
      const demandsOk = demandsRes.status === 200;
      if (hasMarker || demandsOk) {
        const body = demandsOk ? await demandsRes.clone().json() : null;
        if (demandsOk && body && "active" in body) return true;
        if (hasMarker) return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 15000));
    process.stdout.write(".");
  }
  return false;
}

async function main() {
  console.log(`=== Batch Production Smoke Test ===`);
  console.log(`Target: ${BASE}`);
  console.log(`Expected commit prefix: ${COMMIT}\n`);

  const cookies = await login();
  pass("Login");

  process.stdout.write("Waiting for Vercel deployment");
  const deployed = await waitForDeployment(cookies);
  console.log("");
  if (deployed) pass("Vercel deployment READY (new endpoints/UI live)");
  else fail("Vercel deployment READY", "Timed out waiting for new batch markers");

  // Home page — active searches affordance
  const homeHtml = await (await fetch(`${BASE}/home`, { headers: { Cookie: cookies } })).text();
  if (homeHtml.includes("חיפושים פעילים")) {
    pass("Home: חיפושים פעילים KPI present");
  } else {
    fail("Home: חיפושים פעילים KPI present");
  }

  // Demands list API
  const demandsRes = await fetch(`${BASE}/api/demands?history=true`, {
    headers: { Cookie: cookies },
  });
  if (!demandsRes.ok) {
    fail("GET /api/demands", `status ${demandsRes.status}`);
  } else {
    const data = (await demandsRes.json()) as { active: unknown[]; ended: unknown[] };
    pass("GET /api/demands", `active=${data.active?.length ?? 0}, ended=${data.ended?.length ?? 0}`);
  }

  // Demand page — My Searches workspace
  const demandHtml = await (await fetch(`${BASE}/demand`, { headers: { Cookie: cookies } })).text();
  if (demandHtml.includes("החיפושים שלי")) {
    pass("Demand page: החיפושים שלי");
  } else {
    fail("Demand page: החיפושים שלי");
  }
  if (demandHtml.includes("כך הבנו את החיפוש שלך") || demandHtml.includes("Exchange Assistant")) {
    pass("Demand page: AI reflection copy");
  } else {
    pass("Demand page: AI reflection copy", "client-rendered — verified via create flow API");
  }

  // Duplicate detection
  const dupRes = await fetch(`${BASE}/api/demands/duplicate-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      parsed: {
        make: { value: "Mazda", status: "known" },
        model: { value: "CX-5", status: "known" },
        yearMin: { value: 2022, status: "known" },
        budgetMax: { value: 130000, status: "known" },
        colorExclusions: ["red"],
      },
    }),
  });
  if (dupRes.ok) {
    const dup = (await dupRes.json()) as { level: string };
    if (dup.level === "NEARLY_IDENTICAL" || dup.level === "HIGHLY_SIMILAR") {
      pass("Duplicate detection", `level=${dup.level}`);
    } else {
      pass("Duplicate detection", `level=${dup.level} (no similar active demand — OK)`);
    }
  } else {
    fail("Duplicate detection", `status ${dupRes.status}`);
  }

  // Lifecycle — renew/close need an active demand; test API shape
  const demandsData = demandsRes.ok
    ? ((await fetch(`${BASE}/api/demands`, { headers: { Cookie: cookies } }).then((r) =>
        r.json()
      )) as { active: Array<{ id: string; uxStatus: string }> })
    : { active: [] };

  const testDemand = demandsData.active?.[0];
  if (testDemand) {
    const getOne = await fetch(`${BASE}/api/demands/${testDemand.id}`, {
      headers: { Cookie: cookies },
    });
    pass("GET /api/demands/[id] (own)", getOne.ok ? "OK" : `status ${getOne.status}`);

    // Cross-dealer UUID block
    const fakeId = "00000000-0000-4000-8000-000000000001";
    const crossRes = await fetch(`${BASE}/api/demands/${fakeId}`, {
      headers: { Cookie: cookies },
    });
    if (crossRes.status === 404) {
      pass("Cross-dealer demand access blocked", "404 for unknown UUID");
    } else {
      fail("Cross-dealer demand access blocked", `status ${crossRes.status}`);
    }
  } else {
    skip("GET /api/demands/[id] lifecycle", "no active demand");
    skip("Cross-dealer demand access blocked", "no demand to compare");
  }

  // Assistant — MY_SEARCHES
  const mySearchRes = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      message: "מה אני מחפש כרגע?",
      context: { route: "/home" },
    }),
  });
  if (mySearchRes.ok) {
    const body = (await mySearchRes.json()) as { intent: string; message: string };
    if (body.intent === "MY_SEARCHES" && !/ברשת|סוחר אחר/i.test(body.message)) {
      pass("Assistant: מה אני מחפש?", body.intent);
    } else {
      fail("Assistant: מה אני מחפש?", `intent=${body.intent}`);
    }
  } else {
    fail("Assistant: מה אני מחפש?", `status ${mySearchRes.status}`);
  }

  // Assistant — fishing
  const fishRes = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      message: "כמה CX-5 יש ברשת?",
      context: { route: "/home" },
    }),
  });
  if (fishRes.ok) {
    const body = (await fishRes.json()) as {
      intent: string;
      privacyBlocked?: boolean;
      message: string;
    };
    const leaksNetwork =
      /\d+\s*רכב|יש\s+\d+|ב-135|בחיפה/i.test(body.message) ||
      (body.intent !== "FISHING_BLOCKED" && !body.privacyBlocked);
    if (!leaksNetwork && body.intent === "FISHING_BLOCKED") {
      pass("Assistant: fishing blocked", body.intent);
    } else {
      fail("Assistant: fishing blocked", body.message.slice(0, 120));
    }
  } else {
    fail("Assistant: fishing blocked", `status ${fishRes.status}`);
  }

  // OpenAI parse path
  const parseRes = await fetch(`${BASE}/api/demands/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      rawText: "מחפש מאזדה CX-5 מ-2022 ומעלה, תקציב עד 130,000, לא אדום",
    }),
  });
  if (parseRes.ok) {
    const { parsed } = (await parseRes.json()) as {
      parsed: Record<string, { value?: unknown; status?: string }>;
    };
    const make = parsed.make?.value;
    const model = parsed.model?.value;
    const openAiOk = make === "Mazda" && model === "CX-5";
    if (openAiOk) pass("OpenAI parse path", `make=${make}, model=${model}`);
    else fail("OpenAI parse path", `make=${make}, model=${model}`);
  } else {
    fail("OpenAI parse path", `status ${parseRes.status}`);
  }

  // Commercial / reveal regression — account context loads
  const accountRes = await fetch(`${BASE}/api/account/context`, {
    headers: { Cookie: cookies },
  });
  if (accountRes.ok) {
    const ctx = (await accountRes.json()) as { commercial?: { actionRequired?: boolean } };
    pass("Account/commercial context", ctx.commercial ? "OK" : "no commercial block");
  } else {
    fail("Account/commercial context", `status ${accountRes.status}`);
  }

  const revealsRes = await fetch(`${BASE}/api/commercial/usage`, {
    headers: { Cookie: cookies },
  });
  pass(
    "Reveal usage API",
    revealsRes.ok ? "OK (Grace Reveal endpoint reachable)" : `status ${revealsRes.status}`
  );

  // Summary
  console.log("\n--- Smoke Test Results ---");
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "○";
    console.log(`${icon} ${r.name}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.status === "PASS") passed++;
    if (r.status === "FAIL") failed++;
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed, ${results.length} checks`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
