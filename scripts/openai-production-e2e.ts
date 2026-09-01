/**
 * OpenAI Production E2E — runs against live Vercel deployment.
 * Usage: npx tsx scripts/openai-production-e2e.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://rematcher-exchange.vercel.app";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const TEST_INPUT =
  "מחפש מאזדה CX-5 מ-2022 ומעלה, תקציב עד 130,000, לא אדום";

if (!EMAIL || !PASSWORD) {
  console.error("Set E2E_EMAIL and E2E_PASSWORD env vars");
  process.exit(1);
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
      email: EMAIL!,
      password: PASSWORD!,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
    redirect: "manual",
  });

  const sessionCookies = parseSetCookie(loginRes.headers.get("set-cookie"));
  const allCookies = [csrfCookies, sessionCookies].filter(Boolean).join("; ");
  if (!allCookies.includes("session-token")) {
    const text = await loginRes.text();
    throw new Error(`Login failed: ${loginRes.status} ${text.slice(0, 200)}`);
  }
  return allCookies;
}

function extractKnown(
  field?: { value?: unknown; status?: string } | null
): string | number | null {
  if (!field || field.status === "unknown") return null;
  return field.value as string | number | null;
}

async function main() {
  const results: Record<string, string> = {};
  console.log("=== OpenAI Production E2E ===\n");
  console.log(`Target: ${BASE}\n`);

  const cookies = await login();
  console.log("Login: OK\n");

  const parseRes = await fetch(`${BASE}/api/demands/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({ rawText: TEST_INPUT }),
  });

  if (!parseRes.ok) {
    console.log(`Parse API failed: ${parseRes.status} ${await parseRes.text()}`);
    process.exit(1);
  }

  const { demandId, parsed } = (await parseRes.json()) as {
    demandId: string;
    parsed: Record<string, unknown>;
  };

  const make = extractKnown(parsed.make as { value?: string; status?: string });
  const model = extractKnown(parsed.model as { value?: string; status?: string });
  const yearMin = extractKnown(parsed.yearMin as { value?: number; status?: string });
  const budgetMax = extractKnown(parsed.budgetMax as { value?: number; status?: string });
  const exclusions = (parsed.exclusions as Array<{ value?: unknown }>) ?? [];
  const colorExclusions = (parsed.colorExclusions as string[]) ?? [];
  const hasRedExclusion =
    exclusions.some((e) => String(e.value).toLowerCase().includes("red")) ||
    colorExclusions.some((c) => c.toLowerCase().includes("red"));

  console.log("Parsed values:");
  console.log(`  Make: ${make}`);
  console.log(`  Model: ${model}`);
  console.log(`  YearMin: ${yearMin}`);
  console.log(`  BudgetMax: ${budgetMax}`);
  console.log(`  Red exclusion: ${hasRedExclusion}`);
  console.log(`  demandId: ${demandId}\n`);

  const parseOk =
    make === "Mazda" &&
    model === "CX-5" &&
    yearMin === 2022 &&
    budgetMax === 130000 &&
    hasRedExclusion;

  results["Structured parse"] = parseOk ? "PASS" : "FAIL";

  const confirmed = {
    make,
    model,
    yearMin,
    budgetMax,
    colorExclusions: colorExclusions.length
      ? colorExclusions
      : exclusions.filter((e) => (e as { field?: string }).field === "color").map((e) => e.value),
  };

  const confirmRes = await fetch(`${BASE}/api/demands/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({ demandId, confirmed }),
  });

  results["Demand confirmation"] = confirmRes.ok ? "PASS" : "FAIL";
  if (!confirmRes.ok) {
    console.log(`Confirm failed: ${confirmRes.status} ${await confirmRes.text()}`);
  } else {
    const confirmedDemand = await confirmRes.json();
    console.log(`Demand status after confirm: ${confirmedDemand.status}\n`);
  }

  // Fetch demand page HTML for UX copy check
  const demandPageRes = await fetch(`${BASE}/demand`, {
    headers: { Cookie: cookies },
  });
  const demandHtml = await demandPageRes.text();
  const hasHebrewCopy = demandHtml.includes(
    "בדוק שהבנו נכון את החיפוש שלך. החיפוש יופעל רק לאחר אישורך."
  );
  const hasTechnicalMsg =
    /fallback|openai|OPENAI|deterministic/i.test(demandHtml) &&
    !demandHtml.includes("openai.com");

  results["Dealer UX copy in page"] = hasHebrewCopy ? "PASS" : "FAIL";
  results["No technical fallback msg in page shell"] = !hasTechnicalMsg
    ? "PASS"
    : "FAIL";

  console.log("--- Results (partial — check AiOperationLog in DB) ---");
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: ${v}`);
  }

  console.log("\n--- Raw parsed JSON ---");
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
