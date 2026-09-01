/**
 * Production Signup + Forgot Password E2E
 *
 * Usage:
 *   E2E_ADMIN_EMAIL=galsamama@gmail.com E2E_ADMIN_PASSWORD=... npx tsx scripts/signup-e2e-production.ts
 *
 * Requires local .env with DATABASE_URL pointing to production Supabase.
 * Resend delivery statuses: verify manually in Resend dashboard (script logs checklist).
 */
import "dotenv/config";
import { createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { FREE_LIFETIME_REVEALS } from "../src/config/commercial";

const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "galsamama@gmail.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_PASSWORD ?? "";

const ts = Date.now();
const QA_EMAIL = process.env.QA_SIGNUP_EMAIL ?? `qa-signup+${ts}@galsamama.com`;
const QA_PASSWORD = process.env.QA_SIGNUP_PASSWORD ?? `QaTest!${ts}`;
const QA_NEW_PASSWORD = `QaReset!${ts}`;

const prisma = new PrismaClient();
type Result = { name: string; status: "PASS" | "FAIL" | "MANUAL"; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "PASS", detail });
}
function fail(name: string, detail?: string) {
  results.push({ name, status: "FAIL", detail });
}
function manual(name: string, detail?: string) {
  results.push({ name, status: "MANUAL", detail });
}

function parseSetCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const parts = setCookie.split(/,(?=\s*[^;]+=[^;]+)/);
  return parts.map((c) => c.split(";")[0].trim()).join("; ");
}

async function loginAs(email: string, password: string): Promise<string> {
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
      email,
      password,
      callbackUrl: `${BASE}/home`,
      json: "true",
    }),
    redirect: "manual",
  });

  const sessionCookies = parseSetCookie(loginRes.headers.get("set-cookie"));
  const all = [csrfCookies, sessionCookies].filter(Boolean).join("; ");
  if (!all.includes("session-token")) {
    throw new Error(`Login failed for ${email}: ${loginRes.status}`);
  }
  return all;
}

async function checkCommercial(dealerId: string, label: string) {
  const rows = await prisma.dealerCommercial.findMany({ where: { dealerId } });
  if (rows.length !== 1) {
    fail(`Commercial count (${label})`, `expected 1, got ${rows.length}`);
    return;
  }
  const c = rows[0]!;
  if (c.freeRevealAllowance !== FREE_LIFETIME_REVEALS || c.freeRevealUsed !== 0) {
    fail(
      `Trial allowance (${label})`,
      `allowance=${c.freeRevealAllowance} used=${c.freeRevealUsed}`
    );
    return;
  }
  pass(`Trial allowance (${label})`, `${FREE_LIFETIME_REVEALS} connections`);
}


async function createTokenForUser(userId: string, type: "EMAIL_VERIFY" | "PASSWORD_RESET") {
  const { randomBytes } = await import("crypto");
  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.verificationToken.deleteMany({ where: { userId, type, usedAt: null } });
  await prisma.verificationToken.create({
    data: { userId, type, tokenHash, expiresAt },
  });
  return raw;
}

async function main() {
  console.log(`=== Signup E2E Production ===\nBase: ${BASE}\nQA email: ${QA_EMAIL}\n`);

  // 1. Signup
  const signupRes = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "QA Signup Test",
      businessName: `QA Exchange ${ts}`,
      phone: "0501234567",
      email: QA_EMAIL,
      city: "תל אביב",
      region: "מרכז",
      password: QA_PASSWORD,
      confirmPassword: QA_PASSWORD,
    }),
  });

  if (!signupRes.ok) {
    const err = await signupRes.text();
    fail("Signup API", `status ${signupRes.status}: ${err.slice(0, 120)}`);
    printResults();
    process.exit(1);
  }
  pass("Signup API");

  const user = await prisma.user.findUnique({
    where: { email: QA_EMAIL },
    include: {
      memberships: { include: { dealer: { include: { commercial: true } } } },
    },
  });

  if (!user) {
    fail("User created in DB");
    printResults();
    process.exit(1);
  }
  pass("User created in DB", user.id);

  const memberships = user.memberships;
  if (memberships.length !== 1) {
    fail("Membership count", String(memberships.length));
  } else {
    pass("Membership created", memberships[0]!.role);
  }

  const dealer = memberships[0]?.dealer;
  if (!dealer) {
    fail("Dealer created");
    printResults();
    process.exit(1);
  }
  pass("Dealer created", `${dealer.id} PENDING`);
  await checkCommercial(dealer.id, "after signup");

  manual(
    "Verification email (Resend)",
    `Check Resend dashboard for ${QA_EMAIL} — Delivered, link must be ${BASE}/...`
  );

  // 2. Email verification (token via DB for E2E — email was sent on signup)
  const verifyToken = await createTokenForUser(user.id, "EMAIL_VERIFY");
  const verifyRes = await fetch(
    `${BASE}/api/auth/verify-email?token=${verifyToken}`
  );
  if (!verifyRes.ok) {
    fail("Email verification", `status ${verifyRes.status}`);
  } else {
    pass("Email verification API");
  }

  const verifiedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!verifiedUser?.emailVerifiedAt) {
    fail("emailVerifiedAt set");
  } else {
    pass("emailVerifiedAt set");
  }

  await checkCommercial(dealer.id, "after verification");

  manual(
    "Admin notification email (Resend)",
    `Check ${ADMIN_EMAIL} inbox — Delivered, CTA to ${BASE}/admin/dealers/${dealer.id}`
  );

  // 3. Pending permissions (API)
  const pendingCookies = await loginAs(QA_EMAIL, QA_PASSWORD);

  const ctxRes = await fetch(`${BASE}/api/account/context`, {
    headers: { Cookie: pendingCookies },
  });
  if (ctxRes.ok) {
    const ctx = await ctxRes.json();
    if (ctx.verificationStatus === "PENDING") {
      pass("Pending: account context", "PENDING");
    } else {
      fail("Pending: account context", ctx.verificationStatus);
    }
  } else {
    fail("Pending: account context", `status ${ctxRes.status}`);
  }

  const demandsRes = await fetch(`${BASE}/api/demands`, {
    headers: { Cookie: pendingCookies },
  });
  if (demandsRes.status === 403) {
    pass("Pending: demands blocked", "403");
  } else {
    fail("Pending: demands blocked", `status ${demandsRes.status}`);
  }

  const assistantRes = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: pendingCookies,
    },
    body: JSON.stringify({ message: "test", context: { route: "/home" } }),
  });
  if (assistantRes.status === 403) {
    pass("Pending: assistant blocked", "403");
  } else {
    fail("Pending: assistant blocked", `status ${assistantRes.status}`);
  }

  const homeRes = await fetch(`${BASE}/home`, {
    headers: { Cookie: pendingCookies },
    redirect: "manual",
  });
  if (homeRes.status === 307 || homeRes.status === 302) {
    const loc = homeRes.headers.get("location") ?? "";
    if (loc.includes("pending-approval")) {
      pass("Pending: home redirect", loc);
    } else {
      fail("Pending: home redirect", loc);
    }
  } else {
    fail("Pending: home redirect", `status ${homeRes.status}`);
  }

  // 4. Admin approve
  if (!ADMIN_PASSWORD) {
    fail("Admin approval", "E2E_ADMIN_PASSWORD not set");
  } else {
    const adminCookies = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    const approveRes = await fetch(
      `${BASE}/api/admin/dealers/${dealer.id}/approve`,
      { method: "POST", headers: { Cookie: adminCookies } }
    );
    if (approveRes.ok) {
      pass("Admin approval API");
    } else {
      fail("Admin approval API", `status ${approveRes.status}`);
    }
  }

  const approvedDealer = await prisma.dealer.findUnique({
    where: { id: dealer.id },
  });
  if (approvedDealer?.verificationStatus === "VERIFIED") {
    pass("Dealer VERIFIED in DB");
  } else {
    fail("Dealer VERIFIED in DB", approvedDealer?.verificationStatus ?? "null");
  }

  await checkCommercial(dealer.id, "after approval");

  manual(
    "Dealer approved email (Resend)",
    `Check ${QA_EMAIL} — Delivered, link ${BASE}/home`
  );

  // 5. Verified login → home
  const verifiedCookies = await loginAs(QA_EMAIL, QA_PASSWORD);
  const homeOk = await fetch(`${BASE}/home`, {
    headers: { Cookie: verifiedCookies },
    redirect: "manual",
  });
  if (homeOk.status === 200) {
    pass("Verified login → home", "200");
  } else {
    fail("Verified login → home", `status ${homeOk.status}`);
  }

  await checkCommercial(dealer.id, "after login");

  // 6. Forgot password E2E
  const forgotRes = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: QA_EMAIL }),
  });
  if (forgotRes.ok) {
    pass("Forgot password generic response");
  } else {
    fail("Forgot password", `status ${forgotRes.status}`);
  }

  manual(
    "Password reset email (Resend)",
    `Check ${QA_EMAIL} — Delivered, link ${BASE}/reset-password?...`
  );

  const resetToken = await createTokenForUser(user.id, "PASSWORD_RESET");
  const resetRes = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: resetToken,
      password: QA_NEW_PASSWORD,
      confirmPassword: QA_NEW_PASSWORD,
    }),
  });
  if (resetRes.ok) {
    pass("Password reset API");
  } else {
    fail("Password reset API", `status ${resetRes.status}`);
  }

  const reuseRes = await fetch(`${BASE}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: resetToken,
      password: QA_NEW_PASSWORD,
      confirmPassword: QA_NEW_PASSWORD,
    }),
  });
  if (reuseRes.status === 400) {
    pass("Reset token one-time use", "400 on reuse");
  } else {
    fail("Reset token one-time use", `status ${reuseRes.status}`);
  }

  const oldLogin = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: "skip",
      email: QA_EMAIL,
      password: QA_PASSWORD,
      json: "true",
    }),
    redirect: "manual",
  });
  // Old password should fail at authorize — check via fresh login attempt
  try {
    await loginAs(QA_EMAIL, QA_PASSWORD);
    fail("Old password rejected");
  } catch {
    pass("Old password rejected");
  }

  try {
    await loginAs(QA_EMAIL, QA_NEW_PASSWORD);
    pass("New password works");
  } catch {
    fail("New password works");
  }

  printResults();
  await prisma.$disconnect();
  const failed = results.filter((r) => r.status === "FAIL").length;
  process.exit(failed > 0 ? 1 : 0);
}

function printResults() {
  console.log("\n--- Results ---");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "MANUAL" ? "○" : "✗";
    console.log(
      `${icon} ${r.name}: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`
    );
  }
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const manualCount = results.filter((r) => r.status === "MANUAL").length;
  console.log(
    `\nTotal: ${passed} passed, ${failed} failed, ${manualCount} manual (Resend)`
  );
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
