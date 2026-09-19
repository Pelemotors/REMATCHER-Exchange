#!/usr/bin/env npx tsx
/**
 * Authenticated runtime E2E against isolated Field Test (HTTP + DB).
 * Never points at Production. Never mutates REAL dealers.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertIsolatedFieldTestDatabase,
  createHarnessClient,
  createPendingDemand,
  ensureSyntheticDealers,
  markVehicleNetworkReady,
  wipeSyntheticE2E,
  type SyntheticIdentity,
} from "../src/services/testing/synthetic-e2e-harness";

type Check = { name: string; ok: boolean; detail: string };

const FORBIDDEN_BASES = [
  "exchange.rematcher.co.il",
  "127.0.0.1:3200",
  "localhost:3200",
];

function loadFieldTestEnv() {
  const envPath = resolve(
    process.cwd(),
    process.env.FIELD_TEST_ENV_FILE || "../field-test/.env.field-test"
  );
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq);
    let val = line.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function assertSafeBase(base: string) {
  const lower = base.toLowerCase();
  if (FORBIDDEN_BASES.some((b) => lower.includes(b))) {
    throw new Error(`REFUSING E2E against production-shaped base: ${base}`);
  }
  const ok =
    lower.includes("3100") ||
    lower.includes("field-test") ||
    lower.includes("fieldtest");
  if (!ok) {
    throw new Error(`REFUSING E2E: base is not Field Test (${base})`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function leakKeys(value: unknown): string[] {
  const text = JSON.stringify(value ?? {});
  const hits: string[] = [];
  for (const needle of [
    "e2e-core+b@",
    "E2E Synthetic Motors B",
    "0501111002",
    "b2bPrice",
  ]) {
    if (text.includes(needle)) hits.push(needle);
  }
  return hits;
}

async function api(
  base: string,
  token: string | null,
  path: string,
  init?: RequestInit
) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function createVehicle(
  base: string,
  token: string,
  body: Record<string, unknown>
) {
  const res = await api(base, token, "/api/v1/inventory", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const rec = asRecord(res.json);
  const id = typeof rec.id === "string" ? rec.id : "";
  return { ...res, id };
}

async function main() {
  loadFieldTestEnv();
  const base =
    process.env.PRODUCT_CORE_E2E_BASE ||
    process.env.FIELD_TEST_PUBLIC_URL ||
    "http://127.0.0.1:3100";
  assertSafeBase(base);
  const databaseUrl = process.env.DATABASE_URL || "";
  assertIsolatedFieldTestDatabase(databaseUrl);
  const db = createHarnessClient(databaseUrl);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail.slice(0, 220)}`);
  };

  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    add(
      "health_field_test",
      Boolean(health?.ok || health?.status === "ok" || health?.commit),
      JSON.stringify({
        commit: health?.fullCommit || health?.commit,
        migrations: health?.migrationsApplied,
        env: health?.environment,
      })
    );

    const { a, b } = await ensureSyntheticDealers(db);
    add(
      "synthetic_identities",
      Boolean(a.accessToken && b.accessToken),
      `${a.email} / ${b.email}`
    );
    const aDealer = await db.dealer.findUniqueOrThrow({
      where: { id: a.dealerId },
    });
    const bDealer = await db.dealer.findUniqueOrThrow({
      where: { id: b.dealerId },
    });
    add(
      "real_isolation",
      aDealer.marketMode === "SYNTHETIC" &&
        bDealer.marketMode === "SYNTHETIC" &&
        aDealer.cohort === "SYNTHETIC_E2E" &&
        bDealer.cohort === "SYNTHETIC_E2E",
      "both dealers SYNTHETIC"
    );

    const me = await api(base, a.accessToken, "/api/v1/me");
    add("auth_a", me.status === 200, `status=${me.status}`);

    // A. PURCHASE
    const purchaseCreate = await createVehicle(base, a.accessToken, {
      make: "Mazda",
      model: "3",
      year: 2021,
      dealerRelationship: "OFFERED_TO_ME",
    });
    const purchaseId = purchaseCreate.id;
    add(
      "purchase_create",
      purchaseCreate.status === 201 && Boolean(purchaseId),
      `status=${purchaseCreate.status} id=${purchaseId}`
    );
    const purchaseDecision = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${purchaseId}/decision`
    );
    const purchaseDec = asRecord(asRecord(purchaseDecision.json).decision);
    add(
      "purchase_open",
      purchaseDecision.status === 200 &&
        purchaseDec.status === "OPEN" &&
        purchaseDec.type === "PURCHASE",
      JSON.stringify({
        status: purchaseDecision.status,
        decision: purchaseDec.status,
        type: purchaseDec.type,
      })
    );
    const purchaseSnap = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${purchaseId}/decision/snapshot`
    );
    const purchaseSnapRec = asRecord(purchaseSnap.json);
    add(
      "purchase_snapshot",
      purchaseSnap.status === 200 && purchaseSnapRec.workspaceActive === true,
      `status=${purchaseSnap.status} active=${purchaseSnapRec.workspaceActive}`
    );
    await api(base, a.accessToken, `/api/v1/inventory/${purchaseId}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ incomingAskPrice: 82000 }),
    });
    const purchaseAccept = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${purchaseId}/decision/accept`,
      {
        method: "POST",
        body: JSON.stringify({ incomingAgreedPrice: 80000 }),
      }
    );
    const purchaseVehicle = await db.vehicle.findUniqueOrThrow({
      where: { id: purchaseId },
    });
    const purchaseTerminal = await db.vehicleDecision.findFirst({
      where: { vehicleId: purchaseId, dealerId: a.dealerId },
      orderBy: { openedAt: "desc" },
    });
    add(
      "runtime_purchase",
      purchaseAccept.status === 200 &&
        purchaseVehicle.dealerRelationship === "OWNED" &&
        purchaseTerminal?.status === "ACCEPTED",
      JSON.stringify({
        http: purchaseAccept.status,
        rel: purchaseVehicle.dealerRelationship,
        decision: purchaseTerminal?.status,
      })
    );

    // B. TRADE
    const outgoing = await createVehicle(base, a.accessToken, {
      make: "Hyundai",
      model: "i20",
      year: 2019,
      dealerRelationship: "OWNED",
    });
    const incomingTrade = await createVehicle(base, a.accessToken, {
      make: "Kia",
      model: "Sportage",
      year: 2020,
      dealerRelationship: "TRADE_IN_CANDIDATE",
    });
    await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${incomingTrade.id}/decision`,
      {
        method: "PATCH",
        body: JSON.stringify({
          outgoingVehicleId: outgoing.id,
          incomingAgreedPrice: 15000,
          outgoingAgreedPrice: 42000,
        }),
      }
    );
    const tradeSnap = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${incomingTrade.id}/decision/snapshot`
    );
    const tradeSnapRec = asRecord(tradeSnap.json);
    add(
      "trade_snapshot",
      tradeSnap.status === 200 &&
        tradeSnapRec.workspaceActive === true &&
        tradeSnapRec.kind === "TRADE",
      `kind=${tradeSnapRec.kind}`
    );
    const tradeAccept = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${incomingTrade.id}/decision/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          incomingAgreedPrice: 15000,
          outgoingVehicleId: outgoing.id,
          outgoingAgreedPrice: 42000,
        }),
      }
    );
    const incomingAfter = await db.vehicle.findUniqueOrThrow({
      where: { id: incomingTrade.id },
    });
    const outgoingAfter = await db.vehicle.findUniqueOrThrow({
      where: { id: outgoing.id },
    });
    add(
      "runtime_trade",
      tradeAccept.status === 200 &&
        incomingAfter.dealerRelationship === "OWNED" &&
        outgoingAfter.status !== "SOLD",
      JSON.stringify({
        http: tradeAccept.status,
        incoming: incomingAfter.dealerRelationship,
        outgoingStatus: outgoingAfter.status,
      })
    );

    // G. CATALOG / EXPOSURE / SHARE (owned vehicle from purchase)
    const catalogUpsert = await api(base, a.accessToken, "/api/v1/catalog/me", {
      method: "POST",
      body: JSON.stringify({
        slug: "e2e-core-a",
        displayName: "E2E Synthetic Catalog A",
        phone: "0501111001",
        publicationPolicy: "MANUAL",
      }),
    });
    const catalogPublish = await api(base, a.accessToken, "/api/v1/catalog/publish", {
      method: "POST",
      body: JSON.stringify({ vehicleId: purchaseId }),
    });
    const catalogEnable = await api(base, a.accessToken, "/api/v1/catalog/me", {
      method: "POST",
      body: JSON.stringify({ action: "enable" }),
    });
    const exposure = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${purchaseId}/exposure`
    );
    const share = await api(base, a.accessToken, "/api/v1/sharing/resolve", {
      method: "POST",
      body: JSON.stringify({ kind: "VEHICLE", resourceId: purchaseId }),
    });
    const shareRec = asRecord(share.json);
    const leadRes = await api(
      base,
      null,
      "/api/public/catalog/e2e-core-a/leads",
      {
        method: "POST",
        body: JSON.stringify({
          name: "E2E Lead",
          phone: "0509999001",
          message: "synthetic",
          clientSubmissionId: `e2e-core-lead-${Date.now()}`,
        }),
      }
    );
    add(
      "runtime_catalog_share",
      catalogUpsert.status === 200 &&
        catalogPublish.status === 200 &&
        catalogEnable.status === 200 &&
        exposure.status === 200 &&
        share.status === 200 &&
        leadRes.status === 200 &&
        leakKeys(shareRec).filter((k) => k !== "b2bPrice").length === 0 &&
        !JSON.stringify(shareRec).includes("e2e-core+b@"),
      JSON.stringify({
        upsert: catalogUpsert.status,
        publish: catalogPublish.status,
        enable: catalogEnable.status,
        exposure: exposure.status,
        share: share.status,
        lead: leadRes.status,
      })
    );

    // C+D matching: vehicle first, demand later
    const supply = await createVehicle(base, b.accessToken, {
      make: "Mazda",
      model: "CX-5",
      year: 2022,
      dealerRelationship: "OWNED",
      b2bPrice: 110000,
    });
    await markVehicleNetworkReady(db, supply.id, { b2bPrice: 110000 });
    const published = await api(
      base,
      b.accessToken,
      `/api/v1/inventory/${supply.id}/visibility`,
      { method: "POST", body: JSON.stringify({ action: "publish" }) }
    );
    add(
      "seller_publish",
      published.status === 200,
      `status=${published.status} ${published.text.slice(0, 120)}`
    );

    const demand = await createPendingDemand(
      db,
      a.dealerId,
      "מחפש Mazda CX-5 2020 עד 2024",
      { make: "Mazda", model: "CX-5", yearMin: 2020, yearMax: 2024 }
    );
    const confirm = await api(base, a.accessToken, "/api/v1/demands/confirm", {
      method: "POST",
      body: JSON.stringify({
        demandId: demand.id,
        confirmed: { make: "Mazda", model: "CX-5", yearMin: 2020, yearMax: 2024 },
        publishMode: "network",
      }),
    });
    const confirmRec = asRecord(confirm.json);
    const matches = await api(base, a.accessToken, "/api/v1/matches");
    const matchItems = (asRecord(matches.json).items as unknown[]) ?? [];
    const firstMatch = asRecord(matchItems[0]);
    const matchId = typeof firstMatch.id === "string" ? firstMatch.id : "";
    const dealerOppRows = await db.dealerOpportunity.findMany({
      where: {
        dealerId: b.dealerId,
        type: "NETWORK_DEMAND_FOR_MY_VEHICLE",
        status: "OPEN",
      },
    });
    add(
      "runtime_reverse_matching",
      confirm.status === 200 &&
        Number(confirmRec.immediateMatchCount ?? 0) > 0 &&
        dealerOppRows.length > 0,
      JSON.stringify({
        confirm: confirm.status,
        immediate: confirmRec.immediateMatchCount,
        sellerDealerOpps: dealerOppRows.length,
      })
    );
    add(
      "buyer_match_visible",
      matches.status === 200 && Boolean(matchId) && leakKeys(firstMatch).length === 0,
      `count=${matchItems.length} leaks=${leakKeys(firstMatch).join(",")}`
    );

    const interest = await api(
      base,
      a.accessToken,
      `/api/v1/matches/${matchId}/interest`,
      { method: "POST", body: JSON.stringify({ action: "interested" }) }
    );
    const opps = await api(base, b.accessToken, "/api/v1/opportunities");
    const oppItems = (asRecord(opps.json).items as unknown[]) ?? [];
    const opp = asRecord(oppItems[0]);
    const oppId = typeof opp.id === "string" ? opp.id : "";
    add(
      "seller_opportunity",
      interest.status === 200 && opps.status === 200 && Boolean(oppId),
      `interest=${interest.status} opp=${oppId}`
    );
    const sellerInterest = await api(base, b.accessToken, "/api/v1/opportunities", {
      method: "POST",
      body: JSON.stringify({ opportunityId: oppId, action: "interested" }),
    });
    const sellerRec = asRecord(sellerInterest.json);
    const revealId =
      (typeof sellerRec.revealId === "string" && sellerRec.revealId) ||
      (typeof asRecord(sellerRec.reveal).id === "string"
        ? String(asRecord(sellerRec.reveal).id)
        : "") ||
      (typeof opp.revealId === "string" ? opp.revealId : "");
    const oppsAfter = await api(base, b.accessToken, "/api/v1/opportunities");
    const revealFromList =
      revealId ||
      String(
        asRecord(((asRecord(oppsAfter.json).items as unknown[]) ?? [])[0])
          .revealId ?? ""
      );
    const revealGet = revealFromList
      ? await api(base, a.accessToken, `/api/v1/reveals/${revealFromList}`)
      : { status: 0, json: null, text: "no-reveal-id" };
    add(
      "runtime_buyer_seller_reveal",
      sellerInterest.status === 200 &&
        Boolean(revealFromList) &&
        revealGet.status === 200,
      JSON.stringify({
        seller: sellerInterest.status,
        revealId: revealFromList,
        reveal: revealGet.status,
      })
    );

    // E. EXTERNAL
    const external = await createVehicle(base, a.accessToken, {
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      dealerRelationship: "EXTERNAL",
    });
    const extDecision = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${external.id}/decision`
    );
    const extMarket = await api(
      base,
      a.accessToken,
      `/api/v1/market/activity?vehicleId=${external.id}`
    );
    const extPublish = await api(
      base,
      a.accessToken,
      `/api/v1/inventory/${external.id}/visibility`,
      { method: "POST", body: JSON.stringify({ action: "publish" }) }
    );
    const extCatalog = await api(base, a.accessToken, "/api/v1/catalog/publish", {
      method: "POST",
      body: JSON.stringify({ vehicleId: external.id }),
    });
    const ownedList = await api(
      base,
      a.accessToken,
      "/api/v1/inventory?filter=owned"
    );
    const ownedItems = ((asRecord(ownedList.json).items as unknown[]) ?? []).map(
      (row) => asRecord(row).id
    );
    const extRow = await db.vehicle.findUniqueOrThrow({
      where: { id: external.id },
    });
    add(
      "runtime_external",
      external.status === 201 &&
        extDecision.status === 404 &&
        extMarket.status === 200 &&
        extPublish.status >= 400 &&
        extCatalog.status >= 400 &&
        !ownedItems.includes(external.id) &&
        extRow.dealerRelationship === "EXTERNAL" &&
        extRow.visibility !== "ANONYMOUS_NETWORK",
      JSON.stringify({
        create: external.status,
        decision: extDecision.status,
        market: extMarket.status,
        publish: extPublish.status,
        catalog: extCatalog.status,
        visibility: extRow.visibility,
      })
    );

    // H. NEGATIVE MATCHING
    const supplyNeg = await createVehicle(base, b.accessToken, {
      make: "Honda",
      model: "Civic",
      year: 2021,
      dealerRelationship: "OWNED",
      b2bPrice: 90000,
    });
    await markVehicleNetworkReady(db, supplyNeg.id, { b2bPrice: 90000 });
    await api(
      base,
      b.accessToken,
      `/api/v1/inventory/${supplyNeg.id}/visibility`,
      { method: "POST", body: JSON.stringify({ action: "publish" }) }
    );
    const demandNeg = await createPendingDemand(
      db,
      a.dealerId,
      "מחפש Honda Civic",
      { make: "Honda", model: "Civic", yearMin: 2019, yearMax: 2023 }
    );
    await api(base, a.accessToken, "/api/v1/demands/confirm", {
      method: "POST",
      body: JSON.stringify({
        demandId: demandNeg.id,
        confirmed: { make: "Honda", model: "Civic", yearMin: 2019, yearMax: 2023 },
        publishMode: "network",
      }),
    });
    const negMatches = await api(
      base,
      a.accessToken,
      `/api/v1/matches?demandId=${demandNeg.id}`
    );
    const negItem = asRecord(
      ((asRecord(negMatches.json).items as unknown[]) ?? [])[0]
    );
    const negMatchId = typeof negItem.id === "string" ? negItem.id : "";
    const reject = await api(
      base,
      a.accessToken,
      `/api/v1/matches/${negMatchId}/interest`,
      {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          rejectReason: "לא רלוונטי",
        }),
      }
    );
    await api(base, a.accessToken, "/api/v1/demands/lifecycle", {
      method: "POST",
      body: JSON.stringify({ demandId: demandNeg.id, action: "renew" }),
    });
    const afterReject = await api(
      base,
      a.accessToken,
      `/api/v1/matches?demandId=${demandNeg.id}`
    );
    const afterItems = (asRecord(afterReject.json).items as unknown[]) ?? [];
    const hidden = await db.candidateMatch.findFirst({
      where: { demandId: demandNeg.id, vehicleId: supplyNeg.id },
    });
    const revealAfterReject = await db.reveal.findFirst({
      where: { candidateMatchId: negMatchId },
    });
    add(
      "runtime_negative_matching",
      reject.status === 200 &&
        afterItems.length === 0 &&
        hidden?.status === "HIDDEN" &&
        !revealAfterReject &&
        leakKeys(negItem).length === 0,
      JSON.stringify({
        reject: reject.status,
        resurfaced: afterItems.length,
        hiddenStatus: hidden?.status,
        reveal: Boolean(revealAfterReject),
      })
    );

    // F. ACTION CENTER
    const offeredOpen = await createVehicle(base, a.accessToken, {
      make: "Ford",
      model: "Focus",
      year: 2017,
      dealerRelationship: "OFFERED_TO_ME",
    });
    if (negMatchId) {
      await db.informationRequest.create({
        data: {
          requesterDealerId: a.dealerId,
          vehicleId: supplyNeg.id,
          demandId: demandNeg.id,
          candidateMatchId: negMatchId,
          requestedFields: ["mileage"],
          fieldsHash: "e2e-core-mileage",
          status: "OPEN",
        },
      });
    }
    await db.validationEvent.create({
      data: {
        type: "AVAILABILITY",
        dealerId: a.dealerId,
        vehicleId: purchaseId,
        status: "PENDING",
      },
    });
    const home = await api(base, a.accessToken, "/api/v1/home");
    const actionCenter = asRecord(asRecord(home.json).actionCenter);
    const items = ((actionCenter.items as unknown[]) ?? []).map((row) =>
      asRecord(row)
    );
    const hrefs = items.map((i) => String(i.href ?? ""));
    const ids = items.map((i) => String(i.id ?? ""));
    const priorities = items.map((i) => Number(i.priority));
    const sorted = priorities.every(
      (p, i) => i === 0 || priorities[i - 1]! <= p
    );
    const unique = new Set(ids).size === ids.length;
    const exact =
      hrefs.every(
        (h) =>
          /^\/(matches|opportunities|dealer-opportunities|validations|catalog\/leads|inventory|reveals)\/[A-Za-z0-9_-]+$/.test(
            h
          ) || /^\/inventory\/[A-Za-z0-9_-]+$/.test(h)
      ) &&
      !hrefs.some((h) => h.includes("/customers?lead=")) &&
      !hrefs.some((h) => h.includes("enrich=1"));
    add(
      "runtime_action_center",
      home.status === 200 && items.length > 0 && sorted && unique && exact,
      JSON.stringify({
        count: items.length,
        types: items.map((i) => i.type),
        hrefs,
        sorted,
        unique,
        exact,
      })
    );

    const realTouched = await db.dealer.count({
      where: {
        marketMode: "REAL",
        updatedAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
        NOT: { cohort: "SYNTHETIC_E2E" },
      },
    });
    add("no_real_mutation_window", realTouched === 0, `realUpdated=${realTouched}`);
  } catch (err) {
    add("runtime_driver", false, err instanceof Error ? err.message : String(err));
  } finally {
    if (process.env.E2E_KEEP_FIXTURES !== "1") {
      await wipeSyntheticE2E(db).catch(() => undefined);
    }
    await db.$disconnect();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    JSON.stringify(
      {
        base,
        passed: checks.filter((c) => c.ok).length,
        failed: failed.length,
        checks,
      },
      null,
      2
    )
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
