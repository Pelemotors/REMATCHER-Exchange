import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createVehicleForDealer } from "@/services/inventory/create-vehicle";

const patchSchema = z
  .object({
    vehicleId: z.string().min(1).max(80),
    status: z.enum(["SOLD"]).optional(),
    fields: z
      .object({
        make: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        trim: z.string().nullable().optional(),
        year: z.number().int().min(1980).max(2100).nullable().optional(),
        mileage: z.number().int().min(0).max(2_000_000).nullable().optional(),
        color: z.string().nullable().optional(),
        ownershipHand: z.number().int().min(0).max(20).nullable().optional(),
        retailPrice: z.number().int().min(0).nullable().optional(),
        b2bPrice: z.number().int().min(0).nullable().optional(),
        region: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    reactivate: z.boolean().optional(),
  })
  .strict();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  filter: z
    .enum(["all", "active", "sold", "attention", "interest", "missing_price"])
    .default("active"),
  q: z.string().max(120).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dealerId = session.user.dealerId;
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { page, pageSize, filter, q } = parsed.data;

  const [
    activeCount,
    soldCount,
    allCount,
    missingPriceCount,
    attentionBase,
    openOpps,
    pendingValidations,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.vehicle.count({ where: { dealerId, status: "SOLD" } }),
    prisma.vehicle.count({
      where: { dealerId, status: { in: ["ACTIVE", "SOLD"] } },
    }),
    prisma.vehicle.count({
      where: {
        dealerId,
        status: "ACTIVE",
        b2bPrice: null,
        retailPrice: null,
      },
    }),
    prisma.vehicle.findMany({
      where: {
        dealerId,
        status: "ACTIVE",
        OR: [
          { freshnessState: { in: ["STALE", "VALIDATION_REQUIRED", "UNKNOWN"] } },
          { b2bPrice: null, retailPrice: null },
        ],
      },
      select: { id: true },
    }),
    prisma.sellerOpportunity.groupBy({
      by: ["vehicleId"],
      where: { vehicle: { dealerId }, status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.validationEvent.groupBy({
      by: ["vehicleId"],
      where: { dealerId, status: "PENDING" },
      _count: { _all: true },
    }),
  ]);

  const oppByVehicle = new Map(
    openOpps.map((o) => [o.vehicleId, o._count._all])
  );
  const valByVehicle = new Map(
    pendingValidations.map((v) => [v.vehicleId, v._count._all])
  );

  const pendingValIds = new Set(
    pendingValidations.map((v) => v.vehicleId)
  );
  const attentionIds = new Set([
    ...attentionBase.map((v) => v.id),
    ...pendingValIds,
  ]);

  const where: Record<string, unknown> = {
    dealerId,
    status: { not: "ARCHIVED" },
  };
  if (filter === "active") where.status = "ACTIVE";
  else if (filter === "sold") where.status = "SOLD";
  else if (filter === "all") where.status = { in: ["ACTIVE", "SOLD"] };
  else if (filter === "missing_price") {
    where.status = "ACTIVE";
    where.b2bPrice = null;
    where.retailPrice = null;
  } else if (filter === "attention") {
    where.id = { in: [...attentionIds] };
  } else if (filter === "interest") {
    where.id = { in: openOpps.map((o) => o.vehicleId) };
  }

  if (q?.trim()) {
    const term = q.trim();
    where.AND = [
      {
        OR: [
          { make: { contains: term, mode: "insensitive" } },
          { model: { contains: term, mode: "insensitive" } },
          { color: { contains: term, mode: "insensitive" } },
        ],
      },
    ];
  }

  const totalMatching = await prisma.vehicle.count({
    where: where as never,
  });

  const vehicles = await prisma.vehicle.findMany({
    where: where as never,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      mileage: true,
      b2bPrice: true,
      retailPrice: true,
      trim: true,
      color: true,
      status: true,
      freshnessState: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  const enriched = vehicles.map((v) => ({
    ...v,
    openInterestCount: oppByVehicle.get(v.id) ?? 0,
    pendingValidationCount: valByVehicle.get(v.id) ?? 0,
  }));

  const snapshot = {
    total: activeCount,
    sold: soldCount,
    all: allCount,
    needsAttention: attentionIds.size,
    withInterest: openOpps.length,
    pendingValidation: pendingValidations.reduce(
      (n, v) => n + v._count._all,
      0
    ),
    missingPrivatePrice: missingPriceCount,
  };

  return NextResponse.json({
    vehicles: enriched,
    snapshot,
    pagination: {
      page,
      pageSize,
      totalCount: totalMatching,
      returnedCount: enriched.length,
      hasMore: page * pageSize < totalMatching,
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { rawInput, ...manualFields } = body;

  const result = await createVehicleForDealer({
    dealerId: session.user.dealerId,
    userId: session.user.id,
    rawInput: rawInput ?? null,
    normalizeFromRaw: Boolean(rawInput),
    fields: rawInput
      ? undefined
      : {
          make: manualFields.make ?? null,
          model: manualFields.model ?? null,
          trim: manualFields.trim ?? null,
          year: manualFields.year ?? null,
          mileage: manualFields.mileage ?? null,
          color: manualFields.color ?? null,
          ownershipHand: manualFields.ownershipHand ?? null,
          retailPrice: manualFields.retailPrice ?? null,
          b2bPrice: manualFields.b2bPrice ?? null,
          region: manualFields.region ?? null,
        },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json(result.vehicle);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { vehicleId, status, fields, reactivate } = parsed.data;

  if (status === "SOLD") {
    const { markVehicleSoldForDealer } = await import(
      "@/services/inventory/mark-sold"
    );
    const result = await markVehicleSoldForDealer({
      dealerId: session.user.dealerId,
      vehicleId,
      source: "inventory_api",
      userId: session.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      vehicle: result.vehicle,
      alreadySold: result.alreadySold,
    });
  }

  if (reactivate) {
    const { reactivateVehicleForDealer } = await import(
      "@/services/inventory/update-vehicle"
    );
    const result = await reactivateVehicleForDealer({
      dealerId: session.user.dealerId,
      vehicleId,
      source: "inventory_api",
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === "not_found" ? 404 : 400 }
      );
    }
    return NextResponse.json({ ok: true, vehicle: result.vehicle });
  }

  if (fields) {
    const { updateVehicleForDealer } = await import(
      "@/services/inventory/update-vehicle"
    );
    const result = await updateVehicleForDealer({
      dealerId: session.user.dealerId,
      vehicleId,
      fields,
      source: "inventory_api",
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          message: "message" in result ? result.message : undefined,
        },
        { status: result.error === "not_found" ? 404 : 400 }
      );
    }
    return NextResponse.json({ ok: true, vehicle: result.vehicle });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
