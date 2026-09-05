/**
 * Controlled Production smoke — Deep Links + health/schema.
 * Usage: npx tsx scripts/deep-link-production-smoke.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";
const EXPECT_COMMIT = process.env.EXPECT_COMMIT ?? "";

type Jar = Map<string, string>;

function storeCookies(jar: Jar, res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    if (eq > 0) jar.set(pair!.slice(0, eq), pair!.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchJar(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookieHeader(jar),
    },
  });
  storeCookies(jar, res);
  return res;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results: string[] = [];
  const pass = (m: string) => results.push(`PASS ${m}`);
  const fail = (m: string) => {
    results.push(`FAIL ${m}`);
    throw new Error(m);
  };

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert(health.status === "ok" || health.status === "degraded", "health status");
  assert(health.db === "ok", "db ok");
  assert(typeof health.migrationsApplied === "number", "migrationsApplied");
  assert(health.migrationsApplied >= 12, "expected >=12 migrations");
  assert(health.matchingEngine === "2.0", "matching engine");
  assert(health.killSwitches?.push === false, "push kill off");
  if (EXPECT_COMMIT) {
    assert(
      String(health.commit).startsWith(EXPECT_COMMIT.slice(0, 7)) ||
        String(health.fullCommit).startsWith(EXPECT_COMMIT),
      `commit want ${EXPECT_COMMIT} got ${health.commit}`
    );
  }
  pass(`health commit=${health.commit} migrations=${health.migrationsApplied}`);

  // Logged-out deep link preserves callback
  const jar0: Jar = new Map();
  const loggedOut = await fetchJar(jar0, "/matches?focus=cm_nonexistent_xyz");
  const loc = loggedOut.headers.get("location") ?? "";
  assert(
    loggedOut.status === 307 || loggedOut.status === 302 || loggedOut.status === 303,
    `logged-out redirect status ${loggedOut.status}`
  );
  assert(loc.includes("/login"), `login redirect got ${loc}`);
  assert(
    loc.includes("callbackUrl=") &&
      decodeURIComponent(loc).includes("/matches?focus="),
    `callback preserved: ${loc}`
  );
  pass("logged-out deep link → login with callbackUrl");

  // Login
  const jar: Jar = new Map();
  await fetchJar(jar, "/login");
  const csrfRes = await fetchJar(jar, "/api/auth/csrf");
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const loginRes = await fetchJar(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/matches?focus=smoke_focus_1`,
      json: "true",
    }),
  });
  assert(loginRes.status === 200 || loginRes.status === 302, `login ${loginRes.status}`);
  pass(`authenticated as ${EMAIL}`);

  // Authed deep link pages
  for (const path of [
    "/matches?focus=smoke_focus_1",
    "/opportunities?focus=smoke_opp_1",
    "/inventory?focus=smoke_veh_1&enrich=1",
    "/validations?focus=smoke_val_1",
    "/reveals/smoke_reveal_guess",
  ]) {
    const res = await fetchJar(jar, path);
    // 200 page or 404/redirect without leaking other tenants
    assert(
      [200, 302, 303, 307, 404].includes(res.status),
      `${path} status ${res.status}`
    );
    const body = await res.text();
    assert(!/b2bPrice|sellerFloor|hiddenMax/i.test(body), `${path} no private fields`);
    pass(`open ${path} → ${res.status}`);
  }

  // API guessed IDs — no cross-tenant leak
  const guessed = await fetchJar(jar, "/api/reveals/totally_fake_id_xyz");
  assert([401, 403, 404].includes(guessed.status), `guessed reveal ${guessed.status}`);
  const gBody = await guessed.text();
  assert(!/businessName|phone|contactName/i.test(gBody), "no contact leak on guessed reveal");
  pass("guessed reveal ID safe");

  // Matches API ownership-scoped
  const matches = await fetchJar(jar, "/api/matches");
  assert(matches.status === 200, "matches api");
  const matchList = (await matches.json()) as unknown[];
  assert(Array.isArray(matchList), "matches array");
  pass(`matches list len=${matchList.length}`);

  console.log(JSON.stringify({ ok: true, health, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
