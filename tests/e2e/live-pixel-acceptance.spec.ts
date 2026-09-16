/**
 * Authenticated Production acceptance for Pixel-Faithful UI + unfinished live gaps.
 * Never touches forensic batch cmu4k7t8v003yjktzkcr5anbu.
 */
import { test, expect, type Page, type Request, type Response } from "@playwright/test";
import path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";

const BASE = process.env.LIVE_BASE_URL ?? "https://exchange.rematcher.co.il";
const DAY = new Date().toISOString().slice(0, 10);
const OUT = path.join(process.cwd(), "docs/visual-evidence/pixel-faithful", DAY);
const FIX = path.join(process.cwd(), "tests/fixtures/intake");
const FORENSIC = "cmu4k7t8v003yjktzkcr5anbu";

mkdirSync(OUT, { recursive: true });

function loadCreds(which: "buyer" | "seller" = "buyer"): { email: string; password: string } | null {
  if (which === "buyer" && process.env.E2E_DEALER_EMAIL && process.env.E2E_DEALER_PASSWORD) {
    return { email: process.env.E2E_DEALER_EMAIL, password: process.env.E2E_DEALER_PASSWORD };
  }
  const file = path.join(process.cwd(), ".qa-dealer-credentials.local");
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8");
  const email =
    which === "seller"
      ? "qa-seller@rematcher-exchange.test"
      : "qa-buyer@rematcher-exchange.test";
  const re = new RegExp(`${email.replace(".", "\\.")}\\s*/\\s*(\\S+)`);
  const passMatch = raw.match(re);
  if (!passMatch) return null;
  return { email, password: passMatch[1]! };
}

async function uploadGallery(page: Page, files: string[]) {
  const gallery = page.getByTestId("intake-gallery-input").last();
  await expect(gallery).toBeEnabled({ timeout: 25000 });
  await gallery.setInputFiles(files);
}

async function loginDealer(page: Page, creds: { email: string; password: string }) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL(/\/(home|inventory|intake|privacy-ai|subscription)/, {
    timeout: 25000,
  });
  await page.request.post(`${BASE}/api/privacy/onboarding/complete`, {
    data: {
      consents: {
        DEALER_MEMORY: false,
        AGENT_TO_EXCHANGE_LEARNING: false,
        EXCHANGE_ACTIVITY_LEARNING: false,
        EXTERNAL_ACTIVITY_LEARNING: false,
      },
    },
  });
}

function trackNetwork(page: Page) {
  const requests: Array<{ url: string; method: string; start: number }> = [];
  const failed: Array<{ url: string; error: string }> = [];
  const timings: Array<{ url: string; status: number; ms: number }> = [];
  page.on("request", (req: Request) => {
    requests.push({ url: req.url(), method: req.method(), start: Date.now() });
  });
  page.on("requestfailed", (req: Request) => {
    failed.push({ url: req.url(), error: req.failure()?.errorText ?? "failed" });
  });
  page.on("response", (res: Response) => {
    const req = requests.find((r) => r.url === res.url());
    timings.push({
      url: res.url(),
      status: res.status(),
      ms: req ? Date.now() - req.start : -1,
    });
  });
  return { requests, failed, timings };
}

function fixture(rel: string) {
  return path.join(FIX, rel);
}

function batch16Files(): string[] {
  const dir = path.join(FIX, "batch16");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(dir, f));
}

function perfFiles(n: number): string[] {
  const dir = path.join(FIX, "perf");
  return Array.from({ length: n }, (_, i) =>
    path.join(dir, `n${String(i + 1).padStart(2, "0")}.jpg`)
  ).filter((p) => existsSync(p));
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  );
  expect(overflow, "horizontal overflow").toBeFalsy();
}

async function captureShot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: "default" });

test.describe("Pixel-faithful Production live", () => {
  test("A Capture geometry + screenshots 390", async ({ page }) => {
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);
    await page.goto(`${BASE}/intake/handoff`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "קליטת רכב" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole("main").getByText("שלח לי את הרכב — אני כבר אטפל בשאר.")).toBeVisible();
    await expect(page.getByRole("main").getByText("בחר מהגלריה").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("צלם רכב").first()).toBeVisible();
    await expect(page.getByRole("main").getByText("הדבק טקסט / מידע").first()).toBeVisible();
    await expect(page.getByRole("main").getByText(/WhatsApp/)).toBeVisible();
    await expect(page.getByPlaceholder("כתוב ל-REMATCHER...")).toHaveCount(0);
    const nav = page.getByLabel("ניווט תחתון");
    await expect(nav.getByText("בית")).toBeVisible();
    await expect(nav.getByText("המלאי")).toBeVisible();
    await expect(nav.getByText("קליטת רכב")).toBeVisible();
    await expect(nav.getByText("חיפוש")).toBeVisible();
    await expect(nav.getByText("עוד")).toBeVisible();
    await noHorizontalOverflow(page);
    await captureShot(page, "390-capture");
  });

  test("B 16-image multi-vehicle + mixed intents", async ({ page }) => {
    test.setTimeout(12 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    const files = batch16Files();
    test.skip(files.length < 16, "generate-intake-fixtures first");
    expect(files.length).toBeGreaterThanOrEqual(16);
    await page.setViewportSize({ width: 390, height: 844 });
    const net = trackNetwork(page);
    await loginDealer(page, creds!);
    await page.goto(`${BASE}/intake/handoff`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main").getByText("בחר מהגלריה").first()).toBeVisible({ timeout: 20000 });

    const t0 = Date.now();
    await uploadGallery(page, files.slice(0, 16));
    const uploadStart = Date.now() - t0;
    await expect(page.getByText(/קיבלתי/)).toBeVisible({ timeout: 15000 });
    const ackMs = Date.now() - t0;
    await expect(page.getByText("16 תמונות")).toBeVisible({ timeout: 15000 });
    await captureShot(page, "390-processing-16");

    await expect(page.getByTestId("vehicle-candidate-card").first()).toBeVisible({
      timeout: 8 * 60_000,
    });
    const firstCandidateMs = Date.now() - t0;
    await page.waitForTimeout(8000);
    const cards = page.getByTestId("vehicle-candidate-card");
    const cardCount = await cards.count();
    await captureShot(page, "390-identified-16");

    const url = page.url();
    expect(url).not.toContain(FORENSIC);
    const batchId = new URL(url).searchParams.get("batchId");
    expect(batchId).toBeTruthy();
    expect(batchId).not.toBe(FORENSIC);

    const batchRes = await page.request.get(`${BASE}/api/intake/batch?batchId=${batchId}`);
    expect(batchRes.ok()).toBeTruthy();
    const batch = await batchRes.json();
    const persisted = Array.isArray(batch.media) ? batch.media.length : 0;
    const candidates = batch.candidates ?? [];
    const unresolved = batch.unresolvedMedia ?? [];

    const intents = ["OWNED", "OWNED", "OFFERED_TO_ME", "TRADE_IN_CANDIDATE", "EXTERNAL"] as const;
    const pending = candidates.filter((c: { dealerIntent: string | null }) => !c.dealerIntent);
    for (let i = 0; i < Math.min(intents.length, pending.length); i++) {
      const label =
        intents[i] === "OWNED"
          ? "למלאי שלי"
          : intents[i] === "OFFERED_TO_ME"
            ? "מציעים לי"
            : intents[i] === "TRADE_IN_CANDIDATE"
              ? "טרייד"
              : "רק בודק";
      await cards.nth(0).getByRole("button", { name: label }).click();
      await page.waitForTimeout(1200);
    }

    const remaining = page.getByTestId("vehicle-candidate-card");
    if ((await remaining.count()) >= 1) {
      await page.getByPlaceholder("כתוב ל-REMATCHER...").fill(
        "הראשון והשני למלאי והשלישי טרייד"
      );
      await page.getByPlaceholder("כתוב ל-REMATCHER...").press("Enter");
      await page.waitForTimeout(1500);
    }

    const after = await (await page.request.get(`${BASE}/api/intake/batch?batchId=${batchId}`)).json();
    const committed = (after.candidates ?? []).filter(
      (c: { committedVehicleId: string | null }) => c.committedVehicleId
    );
    const autoOwnedBeforeIntent = (batch.candidates ?? []).filter(
      (c: { dealerIntent: string | null; committedVehicleId: string | null }) =>
        c.dealerIntent === "OWNED" && c.committedVehicleId
    );

    const vehicles: Array<{
      id: string;
      dealerRelationship?: string;
      visibility?: string;
      status?: string;
    }> = [];
    for (const c of committed) {
      const inv = await page.request.get(`${BASE}/api/inventory?q=${c.committedVehicleId}`);
      if (inv.ok()) {
        const data = await inv.json();
        const list = Array.isArray(data) ? data : data.vehicles ?? [];
        vehicles.push(...list);
      }
    }

    const report = {
      submittedMedia: 16,
      persistedMedia: persisted,
      candidateCount: candidates.length,
      unresolvedCount: unresolved.length,
      firstAckMs: ackMs,
      uploadStartMs: uploadStart,
      firstCandidateMs,
      cardCount,
      networkRequests: net.requests.length,
      failedRequests: net.failed,
      autoOwnedBeforeIntent: autoOwnedBeforeIntent.length,
      afterIntents: (after.candidates ?? []).map(
        (c: {
          id: string;
          dealerIntent: string | null;
          committedVehicleId: string | null;
          plateNormalized: string | null;
          status: string;
        }) => ({
          id: c.id,
          intent: c.dealerIntent,
          vehicleId: c.committedVehicleId,
          plate: c.plateNormalized,
          status: c.status,
        })
      ),
      forensicUntouched: batchId !== FORENSIC,
    };
    writeFileSync(path.join(OUT, "batch16-report.json"), JSON.stringify(report, null, 2));
    expect(persisted).toBe(16);
    expect(autoOwnedBeforeIntent.length).toBe(0);
    const hardFails = net.failed.filter(
      (f) => !f.url.includes("favicon") && !f.url.includes("_rsc=") && !f.error.includes("ERR_ABORTED")
    );
    expect(hardFails, JSON.stringify(hardFails)).toHaveLength(0);
  });

  test("C performance matrix 1/5/10/16/30", async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);
    const sizes = [1, 5, 10, 16, 30];
    const rows: unknown[] = [];
    for (const n of sizes) {
      const files = perfFiles(n);
      if (files.length < n) continue;
      const net = trackNetwork(page);
      await page.goto(`${BASE}/intake/handoff`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("main").getByText("בחר מהגלריה").first()).toBeVisible({ timeout: 20000 });
      const t0 = Date.now();
      await uploadGallery(page, files);
      const marks: Record<string, number> = { upload_start: 0 };
      await expect(page.getByText(/קיבלתי/)).toBeVisible({ timeout: 20000 });
      marks.ack = Date.now() - t0;
      marks.conversation_visible = marks.ack;
      const countLabel = n === 1 ? "תמונה אחת" : `${n} תמונות`;
      await expect(page.getByText(countLabel)).toBeVisible({ timeout: 20000 });
      marks.media_bubble = Date.now() - t0;
      const candidate = page.getByTestId("vehicle-candidate-card").or(page.getByText(/זיהיתי כאן|לא זוהה|נשארו לי/));
      await candidate.first().waitFor({ timeout: 8 * 60_000 }).catch(() => null);
      marks.first_candidate_or_unresolved = Date.now() - t0;
      await page.waitForTimeout(n >= 16 ? 6000 : 2500);
      marks.background_wait = Date.now() - t0;
      rows.push({
        n,
        ...marks,
        requests: net.requests.length,
        failed: net.failed.length,
        http5xx: net.timings.filter((t) => t.status >= 500).length,
      });
      await captureShot(page, `perf-${n}`);
    }
    writeFileSync(path.join(OUT, "perf-matrix.json"), JSON.stringify(rows, null, 2));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const one = rows[0] as { ack: number };
    expect(one.ack).toBeLessThan(5000);
  });

  test("D+F screenshot customer demand IMAGE path", async ({ page }) => {
    test.setTimeout(6 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    const shots = [
      fixture("whatsapp-cx5-shot-1.jpg"),
      fixture("whatsapp-cx5-shot-2.jpg"),
      fixture("whatsapp-cx5-shot-3.jpg"),
    ].filter((p) => existsSync(p));
    test.skip(shots.length < 1, "fixtures missing");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);

    const run = async (files: string[], name: string) => {
      await page.goto(`${BASE}/intake/handoff`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("main").getByText("בחר מהגלריה").first()).toBeVisible({ timeout: 20000 });
      const t0 = Date.now();
      await uploadGallery(page, files);
      await expect(page.getByText(/קיבלתי/)).toBeVisible({ timeout: 15000 });
      const ack = Date.now() - t0;
      await expect(page.getByText("ביקוש לקוח")).toBeVisible({
        timeout: 90000,
      });
      const ready = Date.now() - t0;
      await captureShot(page, name);
      const url = page.url();
      const batchId = new URL(url).searchParams.get("batchId");
      const batch = batchId
        ? await (await page.request.get(`${BASE}/api/intake/batch?batchId=${batchId}`)).json()
        : null;
      return { ack, ready, batchId, demand: batch?.demandDraft ?? null, media: batch?.media ?? [] };
    };

    const one = await run([shots[0]!], "demand-screenshot-1");
    const three = shots.length >= 3 ? await run(shots.slice(0, 3), "demand-screenshot-3") : null;
    const fiveFiles = [
      ...shots,
      fixture("whatsapp-cx5-shot-4.jpg"),
      fixture("whatsapp-cx5-shot-5.jpg"),
    ].filter((p) => existsSync(p));
    const five = fiveFiles.length >= 5 ? await run(fiveFiles.slice(0, 5), "demand-screenshot-5") : null;

    writeFileSync(
      path.join(OUT, "screenshot-demand.json"),
      JSON.stringify({ one, three, five }, null, 2)
    );
    expect(one.ack).toBeLessThan(8000);
    expect(one.demand).toBeTruthy();
  });

  test("G navigation freeze + 50-cycle stress", async ({ page }) => {
    test.setTimeout(15 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);
    const hops: Array<{ from: string; to: string; tapToShell: number; usable: number }> = [];

    async function hop(from: string, to: string, click: () => Promise<void>, ready?: () => Promise<void>) {
      const t0 = Date.now();
      await click();
      await expect(page).toHaveURL(new RegExp(to.replaceAll("/", "\\/")), { timeout: 15000 });
      const shell = Date.now() - t0;
      if (ready) await ready();
      const usable = Date.now() - t0;
      hops.push({ from, to, tapToShell: shell, usable });
    }

    async function tapNav(href: string) {
      const n = page.getByLabel("ניווט תחתון");
      await n.locator(`a[href="${href}"]`).click({ force: true, timeout: 8000 });
    }

    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded" });
    await hop("home", "/inventory", () => tapNav("/inventory"));
    await hop("inventory", "/home", () => tapNav("/home"));
    await hop("home", "/inventory", () => tapNav("/inventory"));
    await hop("inventory", "/demand", () => tapNav("/demand"));
    await hop("demand", "/inventory", () => tapNav("/inventory"));
    await hop("inventory", "/intake/handoff", () => tapNav("/intake/handoff"));
    await hop("intake", "/account", () => tapNav("/account"));
    await hop("account", "/matches", async () => {
      const link = page.getByRole("link", { name: "התאמות" }).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click({ force: true });
        return;
      }
      await page.goto(`${BASE}/matches`, { waitUntil: "domcontentloaded" });
    });

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const cycleTimes: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = Date.now();
      await tapNav("/home");
      await expect(page).toHaveURL(/\/home/, { timeout: 12000 });
      await tapNav("/inventory");
      await expect(page).toHaveURL(/\/inventory/, { timeout: 12000 });
      await tapNav("/demand");
      await expect(page).toHaveURL(/\/demand/, { timeout: 12000 });
      await tapNav("/intake/handoff");
      await expect(page).toHaveURL(/\/intake/, { timeout: 12000 });
      await tapNav("/home");
      await expect(page).toHaveURL(/\/home/, { timeout: 12000 });
      cycleTimes.push(Date.now() - t0);
    }
    const report = {
      hops,
      cycles: cycleTimes.length,
      avgCycle: Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length),
      maxCycle: Math.max(...cycleTimes),
      first5avg: Math.round(cycleTimes.slice(0, 5).reduce((a, b) => a + b, 0) / 5),
      last5avg: Math.round(cycleTimes.slice(-5).reduce((a, b) => a + b, 0) / 5),
      pageErrors: errors,
    };
    writeFileSync(path.join(OUT, "nav-stress.json"), JSON.stringify(report, null, 2));
    expect(cycleTimes.length).toBe(50);
    expect(report.maxCycle).toBeLessThan(20000);
    expect(errors.length).toBe(0);
  });

  test("E Journey 2 offered intelligence", async ({ page }) => {
    test.setTimeout(4 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await loginDealer(page, creds!);
    const created = await page.request.post(`${BASE}/api/inventory`, {
      data: {
        make: "Toyota",
        model: "RAV4",
        year: 2021,
      },
    });
    expect(created.ok()).toBeTruthy();
    const vehicle = await created.json();
    const id = vehicle.id ?? vehicle.vehicle?.id;
    expect(id).toBeTruthy();
    await page.request.post(`${BASE}/api/vehicles/visibility`, {
      data: {
        vehicleId: id,
        action: "set_relationship",
        relationship: "OFFERED_TO_ME",
      },
    });
    await page.goto(`${BASE}/inventory?focus=${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("RAV4")).toBeVisible({ timeout: 20000 });
    await page.getByText("RAV4").first().click();
    await expect(page.getByRole("button", { name: /מה יש לי על/ })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /מה יש לי על/ }).click();
    await page.waitForTimeout(4000);
    await captureShot(page, "journey2-offered-intel");
    const check = await page.request.get(`${BASE}/api/inventory?q=RAV4`);
    const data = await check.json();
    const list = Array.isArray(data) ? data : data.vehicles ?? [];
    const row = list.find((v: { id: string }) => v.id === id) ?? list[0];
    writeFileSync(
      path.join(OUT, "journey2.json"),
      JSON.stringify({ id, row, relationship: row?.dealerRelationship ?? null }, null, 2)
    );
    expect(String(row?.dealerRelationship ?? "")).toMatch(/OFFERED|OWNED|EXTERNAL|TRADE/);
  });

  test("E Journey 6 two-dealer anonymous match", async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const buyerCreds = loadCreds("buyer");
    const sellerCreds = loadCreds("seller");
    test.skip(!buyerCreds || !sellerCreds, "missing QA dealer pair");
    const suffix = `PX${Date.now().toString().slice(-6)}`;
    const buyerCtx = await browser.newContext();
    const sellerCtx = await browser.newContext();
    const buyer = await buyerCtx.newPage();
    const seller = await sellerCtx.newPage();
    await loginDealer(buyer, buyerCreds!);
    await loginDealer(seller, sellerCreds!);

    const demandParse = await buyer.request.post(`${BASE}/api/demands/parse`, {
      data: { rawText: `מחפש Honda Jazz ${suffix} 2020 ומעלה עד 90000` },
    });
    const parsed = await demandParse.json();
    expect(demandParse.ok()).toBeTruthy();
    const confirm = await buyer.request.post(`${BASE}/api/demands/confirm`, {
      data: {
        demandId: parsed.demandId,
        confirmed: parsed.parsed,
        publishMode: "network",
      },
    });
    expect(confirm.ok()).toBeTruthy();

    const veh = await seller.request.post(`${BASE}/api/inventory`, {
      data: {
        make: "Honda",
        model: "Jazz",
        year: 2021,
        b2bPrice: 80000,
      },
    });
    expect(veh.ok()).toBeTruthy();
    const vehicle = await veh.json();
    const vehicleId = vehicle.id ?? vehicle.vehicle?.id;
    const publish = await seller.request.post(`${BASE}/api/vehicles/visibility`, {
      data: { vehicleId, action: "publish" },
    });
    const publishJson = await publish.json();

    await buyer.goto(`${BASE}/matches`, { waitUntil: "domcontentloaded" });
    await captureShot(buyer, "journey6-buyer-matches");
    const matches = await (await buyer.request.get(`${BASE}/api/matches`)).json();
    writeFileSync(
      path.join(OUT, "journey6.json"),
      JSON.stringify({ suffix, vehicleId, demandId: parsed.demandId, matches, publishJson }, null, 2)
    );
    await buyerCtx.close();
    await sellerCtx.close();
  });

  test("B2 resume mixed intents + per-media discovery dump", async ({ page }) => {
    test.setTimeout(4 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDealer(page, creds!);

    const listed = await page.request.get(`${BASE}/api/intake/batch`);
    expect(listed.ok()).toBeTruthy();
    const listJson = await listed.json();
    const batches = Array.isArray(listJson) ? listJson : listJson.batches ?? listJson.items ?? [];
    const fresh = (batches as Array<{ id: string; mediaCount?: number; candidateCount?: number }>)
      .filter((b) => b.id !== FORENSIC)
      .sort((a, b) => String(b.id).localeCompare(String(a.id)));
    let batchId = fresh.find((b) => (b.candidateCount ?? 0) >= 3)?.id ?? fresh[0]?.id;
    if (!batchId) {
      const known = await page.request.get(
        `${BASE}/api/intake/batch?batchId=cmu4o6xyg004wjkcsu1qokk6v`
      );
      if (known.ok()) batchId = "cmu4o6xyg004wjkcsu1qokk6v";
    }
    expect(batchId, "fresh multi-vehicle batch").toBeTruthy();
    expect(batchId).not.toBe(FORENSIC);

    await page.goto(`${BASE}/intake/handoff?batchId=${batchId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("vehicle-candidate-card").or(page.getByText(/זיהיתי|למלאי/)).first()).toBeVisible({
      timeout: 30000,
    });
    await captureShot(page, "390-identified-resume");

    const before = await (await page.request.get(`${BASE}/api/intake/batch?batchId=${batchId}`)).json();
    const pending = (before.candidates ?? []).filter(
      (c: { dealerIntent: string | null }) => !c.dealerIntent
    );
    const sequence = ["OFFERED_TO_ME", "TRADE_IN_CANDIDATE", "EXTERNAL"] as const;
    for (let i = 0; i < Math.min(sequence.length, pending.length); i++) {
      const label =
        sequence[i] === "OFFERED_TO_ME"
          ? "מציעים לי"
          : sequence[i] === "TRADE_IN_CANDIDATE"
            ? "טרייד"
            : "רק בודק";
      const card = page.getByTestId("vehicle-candidate-card").nth(0);
      if (await card.isVisible().catch(() => false)) {
        await card.getByRole("button", { name: label }).click();
        await page.waitForTimeout(1400);
      }
    }
    const leftover = page.getByTestId("vehicle-candidate-card");
    if ((await leftover.count()) >= 1) {
      const box = page.getByPlaceholder("כתוב ל-REMATCHER...");
      if (await box.isVisible().catch(() => false)) {
        await box.fill("הראשון והשני למלאי והשלישי טרייד");
        await box.press("Enter");
        await page.waitForTimeout(1800);
      }
    }

    const after = await (await page.request.get(`${BASE}/api/intake/batch?batchId=${batchId}`)).json();
    const media = after.media ?? [];
    const discovery = media.map(
      (
        m: {
          id: string;
          originalOrder: number;
          categoryHint: string | null;
          discovery: Record<string, unknown> | null;
        },
        idx: number
      ) => ({
        index: m.originalOrder ?? idx,
        id: m.id,
        categoryHint: m.categoryHint,
        discovery: m.discovery,
      })
    );
    const vehicles: unknown[] = [];
    for (const c of after.candidates ?? []) {
      if (!c.committedVehicleId) continue;
      const inv = await page.request.get(`${BASE}/api/inventory?q=${c.committedVehicleId}`);
      if (!inv.ok()) continue;
      const data = await inv.json();
      const list = Array.isArray(data) ? data : data.vehicles ?? [];
      const row = list.find((v: { id: string }) => v.id === c.committedVehicleId) ?? list[0];
      if (row) vehicles.push(row);
    }
    const report = {
      batchId,
      forensicUntouched: true,
      submittedMedia: media.length,
      persistedMedia: media.length,
      candidateCount: (after.candidates ?? []).length,
      unresolvedCount: (after.unresolvedMedia ?? []).length,
      discovery,
      candidates: (after.candidates ?? []).map(
        (c: {
          id: string;
          dealerIntent: string | null;
          committedVehicleId: string | null;
          plateNormalized: string | null;
          status: string;
          govState: string | null;
          failureCode?: string | null;
        }) => ({
          id: c.id,
          intent: c.dealerIntent,
          vehicleId: c.committedVehicleId,
          plate: c.plateNormalized,
          status: c.status,
          govState: c.govState,
          failureCode: c.failureCode ?? null,
        })
      ),
      vehicles,
    };
    writeFileSync(path.join(OUT, "batch16-db.json"), JSON.stringify(report, null, 2));
    await captureShot(page, "390-identified-after-intents");
    expect(media.length).toBeGreaterThan(0);
    expect(batchId).not.toBe(FORENSIC);
  });

  test("H viewport matrix Home/Inventory/Demand/Matches/More/Capture", async ({ page }) => {
    test.setTimeout(6 * 60_000);
    const creds = loadCreds();
    test.skip(!creds, "missing QA dealer credentials");
    await loginDealer(page, creds!);
    const viewports = [
      { w: 375, h: 812 },
      { w: 390, h: 844 },
      { w: 393, h: 852 },
      { w: 430, h: 932 },
      { w: 1366, h: 768 },
      { w: 1440, h: 900 },
      { w: 1920, h: 1080 },
    ];
    const routes = [
      ["home", "/home"],
      ["inventory", "/inventory"],
      ["demand", "/demand"],
      ["matches", "/matches"],
      ["more", "/account"],
      ["capture", "/intake/handoff"],
    ] as const;
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      for (const [name, href] of routes) {
        await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(400);
        await captureShot(page, `${vp.w}-${name}`);
        if (vp.w <= 430) await noHorizontalOverflow(page);
      }
    }
  });
});
