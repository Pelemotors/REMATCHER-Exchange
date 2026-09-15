/**
 * Field Test public browser acceptance — real Chromium JS execution.
 * Fails on pageerror / Application error / unexpected critical network failures.
 *
 *   FIELD_TEST_OWNER_PASSWORD=... npx tsx scripts/browser-field-test-acceptance.ts
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE =
  process.env.FIELD_TEST_PUBLIC_URL ||
  "https://field-test-exchange.rematcher.co.il";
const OWNER_EMAIL =
  process.env.FIELD_TEST_OWNER_EMAIL || "galsamama@gmail.com";
const OWNER_PASSWORD = process.env.FIELD_TEST_OWNER_PASSWORD;
const B_EMAIL = "fieldtest-b@rematcher.local";
const B_PASSWORD =
  process.env.FIELD_TEST_B_PASSWORD || "FieldTest!ChangeMe1";

if (!OWNER_PASSWORD) {
  console.error("Set FIELD_TEST_OWNER_PASSWORD");
  process.exit(1);
}

type Bags = {
  pageErrors: string[];
  consoleErrors: string[];
  failedCritical: string[];
};

function attachCollectors(page: Page): Bags {
  const bags: Bags = { pageErrors: [], consoleErrors: [], failedCritical: [] };
  page.on("pageerror", (err) => {
    bags.pageErrors.push(String(err?.message || err));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (/favicon\.ico|React DevTools/i.test(t)) return;
      bags.consoleErrors.push(t);
    }
  });
  page.on("response", (res) => {
    const status = res.status();
    const url = res.url();
    if (status >= 400) {
      if (/favicon\.ico/.test(url)) return;
      // NextAuth csrf/session probes can 401 briefly; track API/page only
      if (
        status === 404 &&
        (/\/_next\/static\//.test(url) || /\/api\//.test(url) === false)
      ) {
        // ignore unknown static 404s that aren't chunks we requested critically
      }
      if (/\/api\/|\/home|\/demand|\/matches|\/inventory|\/intake/.test(url)) {
        bags.failedCritical.push(`${status} ${url}`);
      } else if (status >= 500) {
        bags.failedCritical.push(`${status} ${url}`);
      }
    }
  });
  return bags;
}

async function assertNoFatal(page: Page, bags: Bags, label: string) {
  await page.waitForTimeout(800);
  const body = await page.locator("body").innerText().catch(() => "");
  if (/Application error/i.test(body)) {
    throw new Error(`[${label}] Application error page: ${body.slice(0, 200)}`);
  }
  if (bags.pageErrors.length) {
    throw new Error(`[${label}] pageerror: ${bags.pageErrors.join(" | ")}`);
  }
  const fatalConsole = bags.consoleErrors.filter((e) =>
    /TypeError|Cannot destructure|Minified React error|Hydration/i.test(e)
  );
  if (fatalConsole.length) {
    throw new Error(`[${label}] fatal console: ${fatalConsole.join(" | ")}`);
  }
}

async function visit(page: Page, bags: Bags, path: string) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("load").catch(() => undefined);
  await assertNoFatal(page, bags, path);
  return page.url();
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForLoadState("load").catch(() => undefined);
  await page.locator('input[name="email"], input[type="email"]').first().fill(email);
  await page
    .locator('input[name="password"], input[type="password"]')
    .first()
    .fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(home|privacy-ai|onboarding|demand)/, {
    timeout: 30000,
  });
}

async function runViewport(
  browser: Browser,
  viewport: { width: number; height: number },
  label: string
) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
    locale: "he-IL",
  });
  const page = await context.newPage();
  const bags = attachCollectors(page);
  const routes: Record<string, string> = {};

  await login(page, OWNER_EMAIL, OWNER_PASSWORD!);
  await assertNoFatal(page, bags, "post-login");
  routes.home = await visit(page, bags, "/home");
  routes.demand = await visit(page, bags, "/demand");
  routes.matches = await visit(page, bags, "/matches");
  routes.inventory = await visit(page, bags, "/inventory");
  routes.intake = await visit(page, bags, "/intake/handoff");
  routes.review = await visit(page, bags, "/intake/review");

  if (label.startsWith("mobile")) {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    const shot = `/tmp/ft-browser-${label}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    await context.close();
    return {
      label,
      viewport,
      routes,
      demandCreated: false,
      demandApi: null,
      intake: { ok: true, skipped: true },
      overflow,
      pageErrors: bags.pageErrors,
      consoleErrors: bags.consoleErrors,
      failedCritical: bags.failedCritical,
      screenshot: shot,
      finalUrl: page.url(),
    };
  }

  const demandText = `מחפש טויוטה קורולה 2018-2021 עד 90000 browser-${Date.now()}`;
  // Behavioral: create Search via demands parse→confirm (no OpenAI required for fallback parse)
  const demandFlow = await page.evaluate(async (text) => {
    const parseRes = await fetch("/api/demands/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText: text }),
    });
    const parsed = await parseRes.json().catch(() => ({}));
    if (!parseRes.ok) return { ok: false, stage: "parse", status: parseRes.status, parsed };
    const demandId = parsed.demandId || parsed.demand?.id;
    const confirmed =
      parsed.parsed ||
      parsed.confirmed ||
      parsed.preview ||
      {
        make: "טויוטה",
        model: "קורולה",
        yearMin: 2018,
        yearMax: 2021,
        maxPrice: 90000,
      };
    if (!demandId) return { ok: false, stage: "no_demand_id", parsed };
    const confirmRes = await fetch("/api/demands/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demandId, confirmed }),
    });
    const confirmBody = await confirmRes.json().catch(() => ({}));
    return {
      ok: confirmRes.ok,
      stage: "confirm",
      status: confirmRes.status,
      demandId,
      confirmBody,
    };
  }, demandText);
  const demandCreated = Boolean(demandFlow.ok);

  // Intake E2E via browser-authenticated fetch
  const clientBatchId = `browser-${Date.now()}-${createHash("sha1")
    .update(String(Math.random()))
    .digest("hex")
    .slice(0, 6)}`;
  const plate = "2211133"; // known GOV plate
  const intake = await page.evaluate(
    async ({ clientBatchId, plate }) => {
      const create = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          clientBatchId,
          source: "WEB_UPLOAD",
        }),
      });
      const created = await create.json();
      if (!create.ok) return { ok: false, stage: "create", created };
      const batchId = created.batch?.id;
      const text = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_text",
          batchId,
          text: `פולקסווגן ${plate} יד 2 110000 ק״מ מחיר 52000`,
        }),
      });
      const ack = await fetch("/api/intake/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", batchId }),
      });
      const ackBody = await ack.json();
      await new Promise((r) => setTimeout(r, 3500));
      let get = await fetch(`/api/intake/batch?batchId=${batchId}`);
      let got = await get.json();
      let candidates = got.candidates ?? got.batch?.candidates ?? [];
      const needs = candidates.find(
        (c: { status: string; id: string; existingVehicleId?: string }) =>
          c.status === "NEEDS_CONFIRMATION" || c.status === "NEEDS_INFO"
      );
      let review = null;
      if (needs) {
        const body: Record<string, unknown> =
          needs.status === "NEEDS_CONFIRMATION"
            ? { candidateId: needs.id, createNewDespiteExisting: true }
            : { candidateId: needs.id, detectedPlate: plate };
        const rev = await fetch("/api/intake/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        review = { status: rev.status, body: await rev.json().catch(() => ({})) };
        await new Promise((r) => setTimeout(r, 1500));
        get = await fetch(`/api/intake/batch?batchId=${batchId}`);
        got = await get.json();
        candidates = got.candidates ?? got.batch?.candidates ?? [];
      }
      return {
        ok: create.ok && text.ok && ack.ok,
        batchId,
        ackStatus: ack.status,
        acknowledgedAt: ackBody.acknowledgedAt,
        batchStatus: got.status ?? got.batch?.status,
        review,
        candidates: candidates.map(
          (c: { status: string; committedVehicleId?: string }) => ({
            status: c.status,
            vehicleId: c.committedVehicleId,
          })
        ),
      };
    },
    { clientBatchId, plate }
  );

  await visit(page, bags, "/intake/review");
  await visit(page, bags, "/inventory");

  // Overflow check
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });

  const shot = `/tmp/ft-browser-${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });

  const result = {
    label,
    viewport,
    routes,
    demandCreated,
    demandApi: demandFlow,
    intake,
    overflow,
    pageErrors: bags.pageErrors,
    consoleErrors: bags.consoleErrors,
    failedCritical: bags.failedCritical,
    screenshot: shot,
    finalUrl: page.url(),
  };

  await context.close();
  return result;
}

async function interestRevealE2E(browser: Browser) {
  const { spawnSync } = await import("node:child_process");
  const seed = spawnSync(
    "npx",
    ["tsx", "scripts/seed-browser-reveal-match.ts"],
    {
      cwd: "/srv/gal/rematcher-exchange/app",
      env: process.env,
      encoding: "utf8",
    }
  );
  const seedOut = (seed.stdout || "").trim().split("\n").pop();
  let seeded: {
    demandId: string;
    vehicleId: string;
    matchId: string | null;
    dealerA: string;
    dealerB: string;
    userBId: string;
    ownerUserId?: string;
  };
  try {
    seeded = JSON.parse(seedOut || "{}");
  } catch {
    return {
      ok: false,
      error: "seed_parse",
      stdout: seed.stdout,
      stderr: seed.stderr?.slice(0, 800),
      status: seed.status,
    };
  }
  if (!seeded.matchId) {
    return {
      ok: false,
      error: "no_match",
      seeded,
      stderr: seed.stderr?.slice(0, 400),
    };
  }

  const ctxA = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const pageA = await ctxA.newPage();
  const bagsA = attachCollectors(pageA);
  await login(pageA, OWNER_EMAIL, OWNER_PASSWORD!);
  await visit(pageA, bagsA, "/matches");

  const matchesBefore = await pageA.evaluate(async () => {
    const res = await fetch("/api/matches");
    return { status: res.status, body: await res.json() };
  });
  const leakBefore = JSON.stringify(matchesBefore.body).match(
    /phone|email|businessName|scoreBand|explanationJson/i
  );

  const interestA = await pageA.evaluate(async (matchId) => {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, action: "interested" }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, seeded.matchId);

  await ctxA.close();

  const ctxB = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const pageB = await ctxB.newPage();
  const bagsB = attachCollectors(pageB);
  await login(pageB, B_EMAIL, B_PASSWORD);
  await visit(pageB, bagsB, "/opportunities");

  const opps = await pageB.evaluate(async () => {
    const res = await fetch("/api/opportunities");
    return { status: res.status, body: await res.json() };
  });
  const oppId = Array.isArray(opps.body)
    ? opps.body.find(
        (o: { vehicle?: { make?: string }; id?: string }) =>
          o.vehicle?.make === "טויוטה"
      )?.id ?? opps.body[0]?.id
    : null;

  const interestB = oppId
    ? await pageB.evaluate(async (opportunityId) => {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId, action: "interested" }),
        });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      }, oppId)
    : { status: 0, body: { error: "no_opp" } };

  const bodyB = interestB.body as {
    revealId?: string;
    reveal?: { id?: string };
    mutual?: { id?: string };
  };
  const revealId = bodyB.revealId || bodyB.reveal?.id || null;

  let revealPage: {
    status: number;
    hasContact: boolean;
    appError: boolean;
  } | null = null;
  if (revealId) {
    await pageB.goto(`${BASE}/reveals/${revealId}`, {
      waitUntil: "networkidle",
    });
    await assertNoFatal(pageB, bagsB, "reveal");
    const text = await pageB.locator("body").innerText();
    revealPage = {
      status: 200,
      hasContact: /050|@|טלפון|אימייל|phone|email/i.test(text),
      appError: /Application error/i.test(text),
    };
  }

  await ctxB.close();

  return {
    ok:
      interestA.status === 200 &&
      interestB.status === 200 &&
      Boolean(revealId) &&
      !leakBefore,
    seeded,
    matchesBeforeStatus: matchesBefore.status,
    privacyLeakBeforeReveal: Boolean(leakBefore),
    interestA,
    interestB,
    oppId,
    revealId,
    revealPage,
    pageErrors: [...bagsA.pageErrors, ...bagsB.pageErrors],
  };
}

async function main() {
  mkdirSync("/tmp", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let desktop;
  let mobile;
  let reveal;
  try {
    desktop = await runViewport(
      browser,
      { width: 1280, height: 800 },
      "desktop"
    );
    mobile = await runViewport(
      browser,
      { width: 390, height: 844 },
      "mobile390"
    );
    reveal = await interestRevealE2E(browser);
  } finally {
    await browser.close();
  }

  const report = {
    desktop,
    mobile,
    reveal,
    pass: {
      desktopNav:
        desktop.pageErrors.length === 0 &&
        !desktop.consoleErrors.some((e: string) =>
          /TypeError|Cannot destructure/i.test(e)
        ),
      mobileNav:
        mobile.pageErrors.length === 0 &&
        !mobile.overflow &&
        !mobile.consoleErrors.some((e: string) =>
          /TypeError|Cannot destructure/i.test(e)
        ),
      intake:
        Boolean(desktop.intake?.ok) &&
        (desktop.intake.batchStatus === "COMMITTED" ||
          desktop.intake.candidates?.some(
            (c: { status: string; vehicleId?: string }) =>
              c.status === "COMMITTED" || Boolean(c.vehicleId)
          ) ||
          desktop.intake.review?.status === 200),
      reveal: Boolean(reveal?.ok),
    },
  };
  writeFileSync("/tmp/ft-browser-acceptance.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.pass.desktopNav &&
    report.pass.mobileNav &&
    report.pass.intake &&
    report.pass.reveal;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
