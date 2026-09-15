#!/usr/bin/env npx tsx
/**
 * Field Test RC smoke: owner login CSRF+credentials, intake ACK path, isolation.
 * No secrets printed. Targets public HTTPS host from AUTH_URL / argv.
 */
import { createHash } from "node:crypto";

const BASE =
  process.argv[2] ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.AUTH_URL ||
  "https://field-test-exchange.rematcher.co.il";

const OWNER_EMAIL = process.env.FIELD_TEST_OWNER_EMAIL || "galsamama@gmail.com";
const OWNER_PASSWORD = process.env.FIELD_TEST_OWNER_PASSWORD;
if (!OWNER_PASSWORD) {
  console.error("Set FIELD_TEST_OWNER_PASSWORD");
  process.exit(1);
}
const B_EMAIL = "fieldtest-b@rematcher.local";
const B_PASSWORD = process.env.FIELD_TEST_B_PASSWORD || "FieldTest!ChangeMe1";

type Jar = Map<string, string>;

function parseSetCookie(res: Response, jar: Jar) {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  for (const raw of list) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getCsrf(jar: Jar) {
  const res = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  parseSetCookie(res, jar);
  const data = (await res.json()) as { csrfToken: string };
  return data.csrfToken;
}

async function login(email: string, password: string) {
  const jar: Jar = new Map();
  const csrf = await getCsrf(jar);
  const body = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/`,
    json: "true",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
    },
    body,
    redirect: "manual",
  });
  parseSetCookie(res, jar);
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  parseSetCookie(sessionRes, jar);
  const session = await sessionRes.json();
  return { jar, session, loginStatus: res.status };
}

async function main() {
  const report: Record<string, unknown> = { base: BASE };

  const unauth = await fetch(`${BASE}/api/intake/batch`);
  report.unauthIntake = { status: unauth.status, ok: unauth.status === 401 };

  const owner = await login(OWNER_EMAIL, OWNER_PASSWORD);
  report.ownerLogin = {
    status: owner.loginStatus,
    hasUser: Boolean(owner.session?.user?.email),
    email: owner.session?.user?.email ?? null,
    dealerId: owner.session?.user?.dealerId ?? null,
  };

  const pages = [
    "/",
    "/home",
    "/demand",
    "/matches",
    "/inventory",
    "/intake/handoff",
    "/intake/review",
  ];
  const pageResults: Record<string, number> = {};
  for (const p of pages) {
    const r = await fetch(`${BASE}${p}`, {
      headers: { Cookie: cookieHeader(owner.jar) },
      redirect: "manual",
    });
    pageResults[p] = r.status;
  }
  report.ownerPages = pageResults;

  const clientBatchId = `smoke-${Date.now()}-${createHash("sha1")
    .update(String(Math.random()))
    .digest("hex")
    .slice(0, 8)}`;
  const uniquePlate = "3121112"; // known present in data.gov.il sample
  const createRes = await fetch(`${BASE}/api/intake/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(owner.jar),
    },
    body: JSON.stringify({
      action: "create",
      clientBatchId,
      source: "WEB_UPLOAD",
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  report.intakeCreate = { status: createRes.status, batchId: created.batch?.id };

  if (created.batch?.id) {
    const textRes = await fetch(`${BASE}/api/intake/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(owner.jar),
      },
      body: JSON.stringify({
        action: "add_text",
        batchId: created.batch.id,
        text: `פולקסווגן ${uniquePlate} יד 2 120000 ק״מ מחיר 55000`,
      }),
    });
    const ackRes = await fetch(`${BASE}/api/intake/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(owner.jar),
      },
      body: JSON.stringify({ action: "ack", batchId: created.batch.id }),
    });
    const ackBody = await ackRes.json().catch(() => ({}));
    report.intakeAck = {
      textStatus: textRes.status,
      ackStatus: ackRes.status,
      acknowledgedAt: ackBody.batch?.acknowledgedAt ?? ackBody.acknowledgedAt,
      status: ackBody.batch?.status ?? ackBody.status,
    };

    // wait briefly for async process
    await new Promise((r) => setTimeout(r, 3500));
    let getRes = await fetch(
      `${BASE}/api/intake/batch?batchId=${created.batch.id}`,
      { headers: { Cookie: cookieHeader(owner.jar) } }
    );
    let got = await getRes.json().catch(() => ({}));
    const candidates = got.candidates ?? got.batch?.candidates ?? [];
    const needs = candidates.find(
      (c: { status: string }) =>
        c.status === "NEEDS_CONFIRMATION" || c.status === "NEEDS_INFO"
    );
    if (needs) {
      const reviewRes = await fetch(`${BASE}/api/intake/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader(owner.jar),
        },
        body: JSON.stringify(
          needs.status === "NEEDS_CONFIRMATION"
            ? {
                candidateId: needs.id,
                confirmExistingVehicleId: needs.existingVehicleId,
              }
            : {
                candidateId: needs.id,
                detectedPlate: uniquePlate,
              }
        ),
      });
      report.reviewResolve = {
        status: reviewRes.status,
        body: await reviewRes.json().catch(() => ({})),
      };
      await new Promise((r) => setTimeout(r, 1500));
      getRes = await fetch(
        `${BASE}/api/intake/batch?batchId=${created.batch.id}`,
        { headers: { Cookie: cookieHeader(owner.jar) } }
      );
      got = await getRes.json().catch(() => ({}));
    }
    report.intakeAfterProcess = {
      status: getRes.status,
      batchStatus: got.status ?? got.batch?.status,
      candidates: (got.candidates ?? got.batch?.candidates ?? []).length,
      candidateStatuses: (got.candidates ?? got.batch?.candidates ?? []).map(
        (c: { status: string }) => c.status
      ),
    };
  }

  const b = await login(B_EMAIL, B_PASSWORD);
  report.dealerBLogin = {
    hasUser: Boolean(b.session?.user?.email),
    dealerId: b.session?.user?.dealerId ?? null,
  };

  if (created.batch?.id && b.session?.user) {
    const cross = await fetch(
      `${BASE}/api/intake/batch?batchId=${created.batch.id}`,
      { headers: { Cookie: cookieHeader(b.jar) } }
    );
    report.dealerBDeniedOwnerBatch = {
      status: cross.status,
      ok: cross.status === 404 || cross.status === 403,
    };
  }

  const homeMobile = await fetch(`${BASE}/`, {
    headers: {
      Cookie: cookieHeader(owner.jar),
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  });
  const html = await homeMobile.text();
  report.mobileWeb = {
    status: homeMobile.status,
    hasViewport: /viewport/i.test(html),
    hasRtl: /dir=["']rtl["']/i.test(html) || /lang=["']he["']/i.test(html),
    overflowSuspect: /min-w-\[(1[2-9]\d{2}|[2-9]\d{3})px\]/.test(html),
  };

  console.log(JSON.stringify(report, null, 2));
  const pass =
    report.unauthIntake &&
    (report.unauthIntake as { ok: boolean }).ok &&
    (report.ownerLogin as { hasUser: boolean }).hasUser &&
    (report.intakeAck as { ackStatus: number })?.ackStatus === 200;
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
