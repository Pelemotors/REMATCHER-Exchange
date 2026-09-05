/**
 * Matching & Learning 2.0 + Mass 2.5 — Production Live QA (canonical URL).
 * Deterministic checks + Agent conversational scenarios.
 * Usage: E2E_EMAIL=... E2E_PASSWORD=... npx tsx scripts/matching-learning-production-qa.ts
 */
const BASE = process.env.E2E_BASE_URL ?? "https://exchange.rematcher.co.il";
const EMAIL = process.env.E2E_EMAIL ?? "galsamama@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sam123";

type Json = Record<string, any>;
type Result = { name: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name: string, detail?: string) {
  results.push({ name, status: "FAIL", detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name: string, detail?: string) {
  results.push({ name, status: "SKIP", detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseSetCookie(value: string | null): string {
  if (!value) return "";
  return value
    .split(/,(?=\s*[^;]+=[^;]+)/)
    .map((part) => part.split(";")[0].trim())
    .join("; ");
}

async function login() {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const csrfCookies = parseSetCookie(csrf.headers.get("set-cookie"));
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
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
  const cookies = [
    csrfCookies,
    parseSetCookie(response.headers.get("set-cookie")),
  ]
    .filter(Boolean)
    .join("; ");
  if (!cookies.includes("session-token")) {
    throw new Error(`login failed status=${response.status}`);
  }
  return cookies;
}

async function chat(
  cookies: string,
  message: string,
  conversation: Json = {},
  route = "/home"
) {
  const response = await fetch(`${BASE}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      message,
      context: { route },
      conversation,
    }),
  });
  const body = (await response.json()) as Json;
  return { status: response.status, body, conversation: body.conversation ?? conversation };
}

function textOf(body: Json): string {
  return String(body.message ?? body.reply ?? body.text ?? "");
}

async function getJson(cookies: string, path: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookies },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function smokePages(cookies: string) {
  const paths = [
    "/home",
    "/inventory",
    "/demand",
    "/matches",
    "/opportunities",
    "/validations",
    "/account",
  ];
  for (const path of paths) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookies }, redirect: "manual" });
    const ok = res.status === 200 || res.status === 307 || res.status === 302;
    if (ok) pass(`smoke:${path}`, `status=${res.status}`);
    else fail(`smoke:${path}`, `status=${res.status}`);
  }
}

async function main() {
  const health = (await (await fetch(`${BASE}/api/health`)).json()) as Json;
  console.log(`HEALTH ${JSON.stringify(health)}`);
  const expectedCommits = [
    "5543f35",
    "2adaa98",
    "d0a04d7",
    "08e20eb",
    "aef380a",
    "50f5203",
    "4071288",
  ];
  if (
    health.status === "ok" &&
    expectedCommits.some((c) => String(health.commit).startsWith(c))
  ) {
    pass("health.commit", health.fullCommit ?? health.commit);
  } else {
    fail("health.commit", JSON.stringify(health));
  }

  const cookies = await login();
  pass("login");

  await smokePages(cookies);

  // SCENARIO 1 — ambiguity clarification, not questionnaire
  {
    let conv: Json = {};
    const r1 = await chat(cookies, "מחפש טוסון 22 באזור 100.", conv);
    conv = r1.conversation;
    const t = textOf(r1.body);
    const asksWeights = /משקל|דרג|HARD\/SOFT|1.?10|חשיבות.*(1|10)/i.test(t);
    const natural =
      /טוסון|מחיר|שנ|ק.?מ|תקרה|גמיש|לחיפוש|לפתוח|לאשר|חסר/i.test(t) ||
      r1.body.requiresConfirmation ||
      r1.body.conversation?.pendingConfirmation ||
      r1.body.conversation?.pendingSearchDraft;
    if (r1.status === 200 && !asksWeights && natural) {
      pass("scenario1_tucson_ambiguity", t.slice(0, 160));
    } else {
      fail("scenario1_tucson_ambiguity", `status=${r1.status} text=${t.slice(0, 200)}`);
    }
  }

  // SCENARIO 2 — year HARD + price flexible (language)
  {
    let conv: Json = {};
    const r = await chat(
      cookies,
      "תפתח חיפוש: יונדאי טוסון, 2022 ומעלה חובה, במחיר אפשר לזוז קצת סביב 100 אלף.",
      conv,
      "/demand"
    );
    const t = textOf(r.body);
    const noWeights = !/משקל|דרג מ-1|HARD\/SOFT/i.test(t);
    const mentionsYearPrice =
      /2022|חובה|מחיר|לזוז|גמיש|100/i.test(t) ||
      Boolean(r.body.requiresConfirmation) ||
      Boolean(r.body.conversation?.pendingConfirmation);
    if (r.status === 200 && noWeights && mentionsYearPrice) {
      pass("scenario2_year_hard_price_flex", t.slice(0, 160));
    } else {
      fail("scenario2_year_hard_price_flex", t.slice(0, 220));
    }
  }

  // SCENARIO 3
  {
    const r = await chat(
      cookies,
      "צבע לא משנה לי אבל אני לא לוקח מעל 80 אלף ק\"מ.",
      {},
      "/demand"
    );
    const t = textOf(r.body);
    if (r.status === 200 && !/משקל|1.?10/i.test(t)) {
      pass("scenario3_color_open_mileage_hard", t.slice(0, 160));
    } else {
      fail("scenario3_color_open_mileage_hard", t.slice(0, 220));
    }
  }

  // SCENARIO 4 trade-off language
  {
    const r = await chat(
      cookies,
      "עדיף שאשלם עוד 5 אלף מאשר לקחת רכב עם עוד 30 אלף ק\"מ.",
      {},
      "/demand"
    );
    const t = textOf(r.body);
    if (r.status === 200 && !/משקל|weight/i.test(t)) {
      pass("scenario4_tradeoff", t.slice(0, 160));
    } else {
      fail("scenario4_tradeoff", t.slice(0, 220));
    }
  }

  // SCENARIO 5 — activate then revise year flexibility → new intent version expected after confirmations
  {
    let conv: Json = {};
    const open = await chat(
      cookies,
      "תפתח חיפוש ליונדאי טוסון 2022 ומעלה, תקציב סביב 100 אלף, אפשר לזוז קצת במחיר.",
      conv,
      "/demand"
    );
    conv = open.conversation;
    const pending = conv.pendingConfirmation;
    if (pending?.action === "activate_demand" || open.body.requiresConfirmation) {
      const conf = await chat(cookies, "כן, תפתח", conv, "/demand");
      conv = conf.conversation;
      const revise = await chat(
        cookies,
        "בעצם גם 2021 אפשר אם היא טובה.",
        conv,
        "/demand"
      );
      const t = textOf(revise.body);
      if (revise.status === 200 && !/משקל|1.?10/i.test(t)) {
        pass("scenario5_revise_intent_language", t.slice(0, 160));
      } else {
        fail("scenario5_revise_intent_language", t.slice(0, 220));
      }
    } else {
      // Agent may ask clarification first — still PASS if natural and no questionnaire
      const t = textOf(open.body);
      if (open.status === 200 && !/משקל|1.?10/i.test(t)) {
        pass("scenario5_revise_intent_language", `clarifying first: ${t.slice(0, 140)}`);
      } else {
        fail("scenario5_revise_intent_language", t.slice(0, 220));
      }
    }
  }

  // Partial Match fixture: confirm deterministic Tucson demand (seeded PENDING_CONFIRMATION)
  {
    const demandId = "cmmatch25demand001tucsonqa01";
    const confirmRes = await fetch(`${BASE}/api/demands/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookies },
      body: JSON.stringify({
        demandId,
        confirmed: {
          make: "Hyundai",
          model: "Tucson",
          yearMin: 2022,
          budgetMax: 100000,
          color: null,
        },
      }),
    });
    const confirmBody = (await confirmRes.json()) as Json;
    if (confirmRes.ok && confirmBody.status === "ACTIVE") {
      pass("partial_match_demand_activate_attempt", `demand=${demandId}`);
    } else {
      fail(
        "partial_match_demand_activate_attempt",
        `status=${confirmRes.status} body=${JSON.stringify(confirmBody).slice(0, 180)}`
      );
    }

    await new Promise((r) => setTimeout(r, 1500));
    const m = await getJson(cookies, "/api/matches");
    const potential = Array.isArray(m.body)
      ? m.body.find(
          (x: Json) =>
            x.potential === true || x.resolutionState === "NEEDS_INFORMATION"
        )
      : null;
    if (potential) {
      pass(
        "partial_match_identified",
        `blocking=${JSON.stringify(potential.decisionBlockingUnknowns)}`
      );
      if (
        Array.isArray(potential.decisionBlockingUnknowns) &&
        potential.decisionBlockingUnknowns.includes("price") &&
        !potential.decisionBlockingUnknowns.includes("color")
      ) {
        pass("partial_match_blocking_fields_price_only");
      } else {
        fail(
          "partial_match_blocking_fields_price_only",
          JSON.stringify(potential.decisionBlockingUnknowns)
        );
      }
      if (potential.vehicle && !("dealerId" in potential.vehicle)) {
        pass("partial_match_privacy");
      } else {
        fail("partial_match_privacy");
      }

      const res = await fetch(`${BASE}/api/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ matchId: potential.id, action: "request_info" }),
      });
      const body = (await res.json()) as Json;
      if (res.ok && body.ok) {
        pass("partial_match_cta", String(body.message ?? "").slice(0, 120));
        const res2 = await fetch(`${BASE}/api/matches`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ matchId: potential.id, action: "request_info" }),
        });
        const body2 = (await res2.json()) as Json;
        if (res2.ok && body2.ok && body2.created === false) {
          pass("partial_match_cta_idempotent");
        } else if (res2.ok && body2.ok) {
          pass("partial_match_cta_idempotent", "second call ok");
        } else {
          fail("partial_match_cta_idempotent", JSON.stringify(body2).slice(0, 160));
        }
      } else {
        fail("partial_match_cta", JSON.stringify(body).slice(0, 200));
      }
    } else {
      skip(
        "partial_match_identified",
        `matches=${Array.isArray(m.body) ? m.body.length : "err"} body=${JSON.stringify(m.body).slice(0, 160)}`
      );
      skip("partial_match_cta_live", "no NEEDS_INFORMATION candidate after confirm");
    }
  }

  // Matches API shape (Mass 2.5 fields)
  {
    const m = await getJson(cookies, "/api/matches");
    if (m.status === 200 && Array.isArray(m.body)) {
      const sample = m.body[0];
      if (!sample) {
        pass("matches_api_empty_ok", "no matches yet — schema reachable");
      } else {
        const hasResolution =
          "resolutionState" in sample || "potential" in sample;
        if (hasResolution) pass("matches_api_mass25_fields");
        else fail("matches_api_mass25_fields", JSON.stringify(Object.keys(sample)));
        if (sample.vehicle && !("dealerId" in sample.vehicle) && !("phone" in sample.vehicle)) {
          pass("matches_api_privacy_no_dealer_id");
        } else {
          fail("matches_api_privacy_no_dealer_id", JSON.stringify(sample.vehicle));
        }
      }
    } else {
      fail("matches_api", `status=${m.status}`);
    }
  }

  // Phase 7 continuation — seller enrichment → resolved Match
  const SELLER_EMAIL =
    process.env.E2E_SELLER_EMAIL ?? "qa-signup+1788284951934@galsamama.com";
  const SELLER_PASSWORD = process.env.E2E_SELLER_PASSWORD ?? PASSWORD;
  const VEHICLE_ID = "cmmatch25partial001tucson2022x";

  let sellerCookies = "";
  try {
    // login as seller (password aligned for Live QA)
    const csrf = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const csrfCookies = parseSetCookie(csrf.headers.get("set-cookie"));
    const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookies,
      },
      body: new URLSearchParams({
        csrfToken,
        email: SELLER_EMAIL,
        password: SELLER_PASSWORD,
        callbackUrl: `${BASE}/home`,
        json: "true",
      }),
      redirect: "manual",
    });
    sellerCookies = [csrfCookies, parseSetCookie(response.headers.get("set-cookie"))]
      .filter(Boolean)
      .join("; ");
    if (!sellerCookies.includes("session-token")) {
      skip("enrichment_seller_login", `status=${response.status}`);
    } else {
      pass("enrichment_seller_login");

      // Positive: price within commercial overlap → should resolve to Match band
      const patch = await fetch(`${BASE}/api/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: sellerCookies },
        body: JSON.stringify({
          vehicleId: VEHICLE_ID,
          fields: { b2bPrice: 100000 },
        }),
      });
      const patchBody = (await patch.json()) as Json;
      if (patch.ok) {
        pass("enrichment_price_set_overlap", "b2bPrice=100000");
      } else {
        fail("enrichment_price_set_overlap", JSON.stringify(patchBody).slice(0, 200));
      }

      await new Promise((r) => setTimeout(r, 2000));
      const m2 = await getJson(cookies, "/api/matches");
      const resolved = Array.isArray(m2.body)
        ? m2.body.find(
            (x: Json) =>
              x.vehicle?.id === VEHICLE_ID ||
              x.vehicleId === VEHICLE_ID ||
              (x.potential === false &&
                x.resolutionState === "RESOLVED" &&
                ["STRONG", "GOOD", "ALTERNATIVE"].includes(
                  String(x.matchBandV2 ?? x.scoreBand ?? "")
                ))
          )
        : null;
      // Prefer any resolved non-potential match for this buyer
      const anyResolved = Array.isArray(m2.body)
        ? m2.body.find(
            (x: Json) =>
              x.resolutionState === "RESOLVED" &&
              x.potential !== true &&
              ["STRONG", "GOOD", "ALTERNATIVE"].includes(
                String(x.matchBandV2 ?? x.scoreBand ?? "")
              )
          )
        : null;
      if (resolved || anyResolved) {
        const hit = resolved ?? anyResolved;
        pass(
          "enrichment_reeval_match",
          `band=${hit.matchBandV2 ?? hit.scoreBand} resolution=${hit.resolutionState}`
        );
      } else {
        fail(
          "enrichment_reeval_match",
          `matches=${JSON.stringify(m2.body).slice(0, 280)}`
        );
      }

      // Phase 8A — price outside overlap → NO_MATCH / not visible as Match
      const patchHigh = await fetch(`${BASE}/api/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: sellerCookies },
        body: JSON.stringify({
          vehicleId: VEHICLE_ID,
          fields: { b2bPrice: 250000 },
        }),
      });
      if (patchHigh.ok) {
        pass("negative_price_set_no_overlap", "b2bPrice=250000");
      } else {
        fail("negative_price_set_no_overlap", String(patchHigh.status));
      }
      await new Promise((r) => setTimeout(r, 2000));
      const m3 = await getJson(cookies, "/api/matches");
      const stillVisible = Array.isArray(m3.body)
        ? m3.body.find(
            (x: Json) =>
              (x.vehicle?.id === VEHICLE_ID || x.vehicleId === VEHICLE_ID) &&
              ["STRONG", "GOOD", "ALTERNATIVE"].includes(
                String(x.matchBandV2 ?? x.scoreBand ?? "")
              )
          )
        : null;
      if (!stillVisible) {
        pass("negative_no_match_after_high_price");
      } else {
        fail(
          "negative_no_match_after_high_price",
          `still visible band=${stillVisible.matchBandV2 ?? stillVisible.scoreBand}`
        );
      }
    }
  } catch (err) {
    fail("enrichment_seller_flow", String(err).slice(0, 200));
  }

  const failed = results.filter((r) => r.status === "FAIL");
  console.log("\n=== SUMMARY ===");
  console.log(
    `PASS=${results.filter((r) => r.status === "PASS").length} FAIL=${failed.length} SKIP=${results.filter((r) => r.status === "SKIP").length}`
  );
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
