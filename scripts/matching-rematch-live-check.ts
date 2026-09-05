/**
 * Focused Live QA: post-enrichment rematch + NO_MATCH invalidation.
 * Usage: npx tsx scripts/matching-rematch-live-check.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";
const SELLER = process.env.E2E_SELLER_EMAIL ?? "qa-signup+1788284951934@galsamama.com";
const VEHICLE = "cmmatch25partial001tucson2022x";

function parseSetCookie(value: string | null): string {
  if (!value) return "";
  return value
    .split(/,(?=\s*[^;]+=[^;]+)/)
    .map((part) => part.split(";")[0].trim())
    .join("; ");
}

async function login(email: string, password: string) {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
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
      email,
      password,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
    redirect: "manual",
  });
  const cookies = [csrfCookies, parseSetCookie(response.headers.get("set-cookie"))]
    .filter(Boolean)
    .join("; ");
  if (!cookies.includes("session-token")) {
    throw new Error(`login failed ${email} status=${response.status}`);
  }
  return cookies;
}

async function patchPrice(sellerCookies: string, price: number) {
  const res = await fetch(`${BASE}/api/inventory`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: sellerCookies },
    body: JSON.stringify({ vehicleId: VEHICLE, fields: { b2bPrice: price } }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function getMatches(buyerCookies: string) {
  const res = await fetch(`${BASE}/api/matches`, { headers: { Cookie: buyerCookies } });
  return res.json();
}

async function main() {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log("HEALTH", health.commit);
  if (!String(health.commit).startsWith("2adaa98")) {
    throw new Error(`unexpected commit ${health.commit}`);
  }

  const buyer = await login(EMAIL, PASSWORD);
  const seller = await login(SELLER, PASSWORD);

  const p100 = await patchPrice(seller, 100000);
  console.log("price100", p100.status, p100.body?.ok);
  await new Promise((r) => setTimeout(r, 5000));
  const m100 = await getMatches(buyer);
  const hit = Array.isArray(m100)
    ? m100.find((x: { scoreBand?: string; resolutionState?: string }) =>
        ["STRONG", "GOOD", "ALTERNATIVE"].includes(String(x.scoreBand)) &&
        x.resolutionState === "RESOLVED"
      )
    : null;
  console.log(
    hit ? `PASS enrichment_reeval_match band=${hit.scoreBand}` : `FAIL enrichment_reeval_match ${JSON.stringify(m100).slice(0, 240)}`
  );

  const p250 = await patchPrice(seller, 250000);
  console.log("price250", p250.status, p250.body?.ok);
  await new Promise((r) => setTimeout(r, 5000));
  const m250 = await getMatches(buyer);
  const still = Array.isArray(m250)
    ? m250.find((x: { scoreBand?: string }) =>
        ["STRONG", "GOOD", "ALTERNATIVE"].includes(String(x.scoreBand))
      )
    : null;
  console.log(
    !still
      ? "PASS negative_no_match_after_high_price"
      : `FAIL negative_no_match_after_high_price band=${still.scoreBand}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
