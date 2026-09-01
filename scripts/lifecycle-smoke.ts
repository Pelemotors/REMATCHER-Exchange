const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";

function parseSetCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=\s*[^;]+=[^;]+)/);
  return parts.map((c) => c.split(";")[0].trim()).join("; ");
}

async function login() {
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

async function main() {
  const cookies = await login();
  const demands = (await fetch(`${BASE}/api/demands`, { headers: { Cookie: cookies } }).then(
    (r) => r.json()
  )) as { active: Array<{ id: string; confirmed: Record<string, unknown> }> };
  const id = demands.active?.[0]?.id;
  if (!id) {
    console.log("SKIP: no active demand for lifecycle");
    return;
  }
  const close = await fetch(`${BASE}/api/demands/lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ demandId: id, action: "close" }),
  });
  console.log(`Close: ${close.status} ${close.ok ? "PASS" : "FAIL"}`);
  const renew = await fetch(`${BASE}/api/demands/lifecycle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({ demandId: id, action: "renew" }),
  });
  console.log(`Renew: ${renew.status} ${renew.ok ? "PASS" : "FAIL"}`);
  const edit = await fetch(`${BASE}/api/demands/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      confirmed: { ...demands.active[0].confirmed, budgetMax: 131000 },
    }),
  });
  console.log(`Edit: ${edit.status} ${edit.ok ? "PASS" : "FAIL"}`);
}

main();
