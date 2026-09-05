import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  fieldLabelHe,
  getOpenEnrichmentForVehicle,
} from "@/services/matching/information-request";
import { updateVehicleForDealer } from "@/services/inventory/update-vehicle";

/**
 * Seller enrichment — exact decision-blocking fields only.
 * Ownership: seller dealer scoped (fail closed).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vehicleId = new URL(req.url).searchParams.get("vehicleId");
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }

  const enrichment = await getOpenEnrichmentForVehicle({
    dealerId: session.user.dealerId,
    vehicleId,
  });
  if (!enrichment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    vehicleId: enrichment.vehicleId,
    openRequestCount: enrichment.openRequestCount,
    fields: enrichment.requestedFields.map((f) => ({
      key: f,
      label: fieldLabelHe(f),
    })),
    // Never expose requester / counterparty
    requesterIdentity: null,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const vehicleId = String(body.vehicleId ?? "");
  const values = (body.values ?? {}) as Record<string, unknown>;
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
  }

  const enrichment = await getOpenEnrichmentForVehicle({
    dealerId: session.user.dealerId,
    vehicleId,
  });
  if (!enrichment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = new Set(enrichment.requestedFields);
  const fields: Record<string, unknown> = {};

  if (allowed.has("price") && values.price != null && values.price !== "") {
    const n = parseInt(String(values.price).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    }
    fields.b2bPrice = n;
  }
  if (allowed.has("mileage") && values.mileage != null && values.mileage !== "") {
    const n = parseInt(String(values.mileage).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "invalid_mileage" }, { status: 400 });
    }
    fields.mileage = n;
  }
  if (allowed.has("year") && values.year != null && values.year !== "") {
    const n = parseInt(String(values.year).replace(/\D/g, ""), 10);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "invalid_year" }, { status: 400 });
    }
    fields.year = n;
  }
  if (allowed.has("trim") && typeof values.trim === "string") {
    fields.trim = values.trim.trim() || null;
  }
  if (allowed.has("color") && typeof values.color === "string") {
    fields.color = values.color.trim() || null;
  }
  if (allowed.has("hand") && values.hand != null && values.hand !== "") {
    const n = parseInt(String(values.hand).replace(/\D/g, ""), 10);
    if (Number.isFinite(n)) fields.ownershipHand = n;
  }

  // Provenance-backed fields (fuel / drivetrain / transmission / seats)
  const provenancePatch: Record<string, string> = {};
  for (const key of ["fuel", "drivetrain", "transmission", "seats"] as const) {
    if (allowed.has(key) && typeof values[key] === "string" && values[key].trim()) {
      provenancePatch[key] = String(values[key]).trim();
    }
  }
  if (Object.keys(provenancePatch).length > 0) {
    fields.fieldProvenance = provenancePatch;
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const result = await updateVehicleForDealer({
    dealerId: session.user.dealerId,
    vehicleId,
    fields: fields as import("@/services/inventory/update-vehicle").VehicleUpdateFields,
    source: "seller_enrichment",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "update_failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    reevaluated: true,
    // Never return commercial match outcome direction to seller UI beyond ok
  });
}
