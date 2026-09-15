/**
 * Field Test integration runtime verification (no secrets printed).
 * FIELD_TEST_OWNER_PASSWORD=... npx tsx scripts/field-test-integration-runtime.ts
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";

const BASE =
  process.env.FIELD_TEST_PUBLIC_URL ||
  "https://field-test-exchange.rematcher.co.il";
const PASSWORD = process.env.FIELD_TEST_OWNER_PASSWORD;
if (!PASSWORD) {
  console.error("Set FIELD_TEST_OWNER_PASSWORD");
  process.exit(1);
}

function stubServerOnly() {
  const stub = "/tmp/ft-server-only-stub";
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, "index.js"), "module.exports={};\n");
  writeFileSync(
    join(stub, "package.json"),
    JSON.stringify({ name: "server-only", main: "index.js" })
  );
  const orig = (Module as unknown as { _resolveFilename: Function })
    ._resolveFilename;
  (Module as unknown as { _resolveFilename: Function })._resolveFilename =
    function (request: string, parent: unknown, isMain: boolean, options: unknown) {
      if (request === "server-only") return join(stub, "index.js");
      return orig.call(this, request, parent, isMain, options);
    };
}

async function main() {
  stubServerOnly();
  const report: Record<string, unknown> = {
    sha: process.env.GIT_SHA || null,
    base: BASE,
  };

  const vapid = await fetch(`${BASE}/api/push/vapid`).then((r) => r.json());
  report.vapidApi = {
    hasPublicKey: Boolean(vapid.publicKey),
    len: (vapid.publicKey || "").length,
  };

  const { lookupVehicleByPlate } = await import(
    "../src/services/identity/gov-vehicle"
  );
  const found = await lookupVehicleByPlate("2211133");
  const missing = await lookupVehicleByPlate("9999999");
  report.gov = {
    found: found.state,
    hasIdentity: Boolean(found.identity?.make && found.identity?.year),
    notFoundOrUnavailable: missing.state,
  };

  const browser = await chromium.launch({ headless: true });
  const page = await (
    await browser.newContext({ ignoreHTTPSErrors: true })
  ).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("galsamama@gmail.com");
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/home/, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const homeText = await page.locator("body").innerText();
  report.auth = {
    ok: !/Application error/i.test(homeText) && page.url().includes("/home"),
    pageErrors: [...pageErrors],
  };

  const openai = await page.evaluate(async () => {
    const res = await fetch("/api/demands/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: "מחפש טויוטה קורולה 2018 עד 2021 עד תשעים אלף שקל",
      }),
    });
    const body = await res.json().catch(() => ({}));
    return {
      status: res.status,
      demandId: body.demandId ?? null,
      make: body.parsed?.make ?? null,
      model: body.parsed?.model ?? null,
      yearMin: body.parsed?.yearMin ?? body.parsed?.year_from ?? null,
    };
  });
  report.openai = openai;

  const media = await page.evaluate(async () => {
    const id = "media-rt-" + Date.now();
    const create = await fetch("/api/intake/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        clientBatchId: id,
        source: "WEB_UPLOAD",
      }),
    });
    const created = await create.json();
    if (!create.ok) return { ok: false, stage: "create", created };
    const batchId = created.batch.id;
    const bin = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      ),
      (c) => c.charCodeAt(0)
    );
    const file = new File([bin], "t.png", { type: "image/png" });
    const fd = new FormData();
    fd.append("batchId", batchId);
    fd.append("file", file);
    fd.append("originalOrder", "0");
    const up = await fetch("/api/intake/batch", { method: "POST", body: fd });
    const upBody = await up.json().catch(() => ({}));
    await fetch("/api/intake/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_text",
        batchId,
        text: "בדיקת מדיה 2211133",
      }),
    });
    const ack = await fetch("/api/intake/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ack", batchId }),
    });
    const ackBody = await ack.json();
    return {
      ok: up.ok && ack.ok,
      uploadStatus: up.status,
      hasMediaUrl: Boolean(upBody.media?.url || upBody.url),
      storageKey: upBody.media?.storageKey || upBody.storageKey || null,
      acknowledgedAt: ackBody.acknowledgedAt ?? null,
      batchId,
    };
  });
  report.media = media;

  const push = await page.evaluate(async () => {
    const vapid = await fetch("/api/push/vapid").then((r) => r.json());
    const status = await fetch("/api/push/status").then((r) => r.json());
    const test = await fetch("/api/push/test-owner", { method: "POST" }).then(
      async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })
    );
    return {
      vapid: Boolean(vapid.publicKey),
      pushConfigured: status.pushConfigured,
      serverSubscriptionCount: status.serverSubscriptionCount,
      testOwner: test,
    };
  });
  report.push = push;

  const pwa = await page.evaluate(async () => {
    const sw = await fetch("/sw.js");
    const man = await fetch("/manifest.json").then((r) => r.json());
    return {
      sw: sw.status,
      name: man.name,
      short_name: man.short_name,
      start_url: man.start_url,
      display: man.display,
      icons: (man.icons || []).length,
    };
  });
  report.pwa = pwa;
  report.pageErrors = pageErrors;

  await browser.close();

  report.isolation = {
    dbPort5435: (process.env.DATABASE_URL || "").includes(":5435"),
    mediaFieldTest: (process.env.MEDIA_ROOT || "").includes(".media-field-test"),
    fieldTestFlag: process.env.FIELD_TEST === "true",
    authHost: (process.env.AUTH_URL || "").includes(
      "field-test-exchange.rematcher.co.il"
    ),
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
