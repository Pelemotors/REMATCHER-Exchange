#!/usr/bin/env npx tsx
/**
 * Post-deploy product-core smoke. Does not mutate REAL dealers.
 * Unauthenticated: route wiring + auth gates.
 * Authenticated (optional PRODUCT_CORE_SMOKE_TOKEN): SYNTHETIC-safe reads only.
 */
const BASE =
  process.argv[2] ||
  process.env.PRODUCT_CORE_SMOKE_BASE ||
  "https://exchange.rematcher.co.il";

type Result = { name: string; ok: boolean; detail: string };

async function hit(
  name: string,
  path: string,
  init?: RequestInit
): Promise<Result> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Accept: "application/json" },
    redirect: "manual",
  });
  const text = await res.text();
  return {
    name,
    ok: res.status > 0,
    detail: `${res.status} ${text.slice(0, 160)}`,
  };
}

async function main() {
  const results: Result[] = [];
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()) as {
    commit?: string;
    ok?: boolean;
  };
  const healthV1 = await fetch(`${BASE}/api/v1/health`).then((r) => r.json()).catch(() => null);
  results.push({
    name: "health",
    ok: Boolean(health?.ok || health?.commit),
    detail: JSON.stringify(health),
  });
  results.push({
    name: "health_v1",
    ok: healthV1 != null,
    detail: JSON.stringify(healthV1),
  });

  for (const [name, path] of [
    ["market_activity_unauth", "/api/v1/market/activity?make=Mazda&model=CX-5"],
    ["decision_snapshot_unauth", "/api/v1/inventory/missing/decision/snapshot"],
    ["exposure_unauth", "/api/v1/inventory/missing/exposure"],
    ["home_unauth", "/api/v1/home"],
  ] as const) {
    const r = await hit(name, path);
    const status = Number(r.detail.split(" ")[0]);
    results.push({
      name,
      ok: status === 401 || status === 403,
      detail: r.detail,
    });
  }

  const token = process.env.PRODUCT_CORE_SMOKE_TOKEN?.trim();
  if (token) {
    const authHit = async (name: string, path: string) => {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const text = await res.text();
      results.push({
        name,
        ok: res.status === 200 || res.status === 400 || res.status === 404,
        detail: `${res.status} ${text.slice(0, 200)}`,
      });
    };
    await authHit("home_auth", "/api/v1/home");
    await authHit("market_activity_auth", "/api/v1/market/activity?make=Mazda&model=CX-5");
    await authHit("catalog_me_auth", "/api/v1/catalog/me");
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`);
  }
  if (failed.length) {
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      base: BASE,
      commit: health.commit ?? null,
      authenticated: Boolean(token),
      results: results.length,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
