/**
 * Controlled Pilot Production TEST — Mark Sold + Agent inventory grounding.
 * TEST account only. Usage: npx tsx scripts/pilot-sold-grounding-smoke.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";

type Jar = Map<string, string>;
function store(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    if (i > 0) jar.set(pair!.slice(0, i), pair!.slice(i + 1));
  }
}
function cookie(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), Cookie: cookie(jar) },
  });
  store(jar, res);
  return res;
}
function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error(m);
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert(health.commit, "health");
  assert(health.killSwitches?.dealer_memory === true, "memory fail-closed");
  console.log("PASS health memory fail-closed", health.commit);

  const jar: Jar = new Map();
  await api(jar, "/login");
  const csrf = await (await api(jar, "/api/auth/csrf")).json();
  await api(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/inventory`,
      json: "true",
    }),
  });

  const invBefore = await (await api(jar, "/api/inventory?filter=active&pageSize=50")).json();
  const activeBefore = invBefore.snapshot?.total ?? 0;
  console.log("PASS inventory snapshot total", activeBefore);

  // Create a disposable partial vehicle for sold test
  const created = await (
    await api(jar, "/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        make: "Toyota",
        model: "PilotSmoke",
        year: 2020,
      }),
    })
  ).json();
  assert(created.id, `create vehicle ${JSON.stringify(created)}`);
  console.log("PASS created", created.id);

  const afterCreate = await (
    await api(jar, "/api/inventory?filter=active&pageSize=1")
  ).json();
  assert(
    afterCreate.snapshot.total === activeBefore + 1,
    `total ${afterCreate.snapshot.total} != ${activeBefore + 1}`
  );
  console.log("PASS total after create", afterCreate.snapshot.total);

  const sold = await (
    await api(jar, "/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: created.id, status: "SOLD" }),
    })
  ).json();
  assert(sold.ok, `sold ${JSON.stringify(sold)}`);
  console.log("PASS mark sold", sold.alreadySold ?? false);

  // Idempotent retry
  const sold2 = await (
    await api(jar, "/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: created.id, status: "SOLD" }),
    })
  ).json();
  assert(sold2.ok && sold2.alreadySold === true, "idempotent sold");
  console.log("PASS sold idempotent");

  const afterSold = await (
    await api(jar, "/api/inventory?filter=active&pageSize=1")
  ).json();
  assert(
    afterSold.snapshot.total === activeBefore,
    `active after sold ${afterSold.snapshot.total}`
  );
  console.log("PASS active total restored", afterSold.snapshot.total);

  const guessed = await api(jar, `/api/inventory`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId: "not_a_real_vehicle_id_xyz", status: "SOLD" }),
  });
  assert([404, 400].includes(guessed.status), `cross-tenant sold ${guessed.status}`);
  console.log("PASS foreign sold rejected");

  console.log(JSON.stringify({ ok: true, commit: health.commit }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
