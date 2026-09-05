/**
 * Public entry production smoke — verifies landing/signup are live.
 * Usage: npx tsx scripts/public-entry-smoke.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";

type Result = { name: string; status: "PASS" | "FAIL"; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "PASS", detail });
}
function fail(name: string, detail?: string) {
  results.push({ name, status: "FAIL", detail });
}

async function main() {
  console.log(`=== Public Entry Smoke ===\nTarget: ${BASE}\n`);

  const healthRes = await fetch(`${BASE}/api/health`);
  if (healthRes.ok) {
    const health = (await healthRes.json()) as {
      commit: string;
      features: { publicLanding: boolean; signup: boolean };
    };
    pass("Health endpoint", `commit=${health.commit}`);
    if (!health.features?.publicLanding) {
      fail("Health: publicLanding flag");
    } else {
      pass("Health: publicLanding flag");
    }
  } else {
    fail("Health endpoint", `status ${healthRes.status} — deploy likely stale`);
  }

  const landingRes = await fetch(`${BASE}/`, { redirect: "manual" });
  const landingHtml = await landingRes.text();

  if (landingRes.status >= 300 && landingRes.status < 400) {
    fail("Anonymous / no redirect", `redirected ${landingRes.status}`);
  } else {
    pass("Anonymous / no redirect");
  }

  if (landingHtml.includes("הצטרפות ל-Exchange")) {
    pass("Landing hero CTA visible");
  } else {
    fail("Landing hero CTA visible", "missing הצטרפות ל-Exchange");
  }

  if (
    landingHtml.includes("מה שאתה מחפש") &&
    landingHtml.includes("בטח נמצא ממש מעבר לפינה")
  ) {
    pass("Landing hero headline");
  } else {
    fail("Landing hero headline");
  }

  if (/buyer@demo|seller@demo|demo123/i.test(landingHtml)) {
    fail("No demo credentials on /");
  } else {
    pass("No demo credentials on /");
  }

  const signupRes = await fetch(`${BASE}/signup`);
  const signupHtml = await signupRes.text();
  if (signupRes.ok && signupHtml.includes("הצטרפות")) {
    pass("/signup accessible");
  } else {
    fail("/signup accessible", `status ${signupRes.status}`);
  }

  const loginRes = await fetch(`${BASE}/login`);
  const loginHtml = await loginRes.text();
  const hasLoginForm =
    loginRes.ok &&
    (loginHtml.includes("התחבר") ||
      loginHtml.includes('type="email"') ||
      loginHtml.includes('name="email"') ||
      loginHtml.includes("/forgot-password"));
  if (hasLoginForm) {
    pass("/login accessible");
  } else {
    fail("/login accessible", `status ${loginRes.status}`);
  }

  if (/buyer@demo|seller@demo|demo123/i.test(loginHtml)) {
    fail("No demo credentials on /login");
  } else {
    pass("No demo credentials on /login");
  }

  if (loginHtml.includes("הצטרפות") || loginHtml.includes("יצירת חשבון")) {
    pass("Login has signup path");
  } else {
    fail("Login has signup path");
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
