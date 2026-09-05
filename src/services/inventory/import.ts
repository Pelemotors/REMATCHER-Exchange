import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "@/lib/prisma-json";
import { logAppEvent } from "@/services/notifications";
import {
  mapHeaders,
  parseRow,
  type VehicleImportField,
} from "./column-mapper";
import { createVehicleForDealer } from "./create-vehicle";
import { updateVehicleForDealer } from "./update-vehicle";
import { markVehicleSoldForDealer } from "./mark-sold";

export interface ImportRowPreview {
  rowIndex: number;
  fields: Record<VehicleImportField, string | number | null>;
  valid: boolean;
  warnings: string[];
  duplicateOfVehicleId: string | null;
  duplicateConfidence: "high" | "medium" | "low" | null;
  skip: boolean;
}

export interface ImportPreview {
  importId: string;
  fileName: string;
  columnMapping: Partial<Record<VehicleImportField, number>>;
  headers: string[];
  rows: ImportRowPreview[];
  summary: {
    total: number;
    valid: number;
    needsAttention: number;
    duplicates: number;
  };
  diff: {
    newCount: number;
    stillActiveCount: number;
    missingFromFile: Array<{
      vehicleId: string;
      label: string;
    }>;
  };
}

function vehicleLabel(fields: ImportRowPreview["fields"]): string {
  return [fields.make, fields.model, fields.year].filter(Boolean).join(" ");
}

function rowHasMinimum(fields: ImportRowPreview["fields"]): boolean {
  return Boolean(fields.make || fields.model || fields.year);
}

function findDuplicate(
  fields: ImportRowPreview["fields"],
  existing: Array<{
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    trim: string | null;
    mileage: number | null;
    rawInput: string | null;
  }>
): { vehicleId: string; confidence: "high" | "medium" | "low" } | null {
  const ref = fields.dealerRefId;
  if (ref) {
    const byRef = existing.find(
      (v) => v.rawInput && v.rawInput.includes(`ref:${ref}`)
    );
    if (byRef) return { vehicleId: byRef.id, confidence: "high" };
  }

  if (fields.vin) {
    const byVin = existing.find(
      (v) => v.rawInput && v.rawInput.includes(`vin:${fields.vin}`)
    );
    if (byVin) return { vehicleId: byVin.id, confidence: "high" };
  }

  if (fields.licensePlate) {
    const byPlate = existing.find(
      (v) =>
        v.rawInput && v.rawInput.includes(`plate:${fields.licensePlate}`)
    );
    if (byPlate) return { vehicleId: byPlate.id, confidence: "high" };
  }

  const combo = existing.filter(
    (v) =>
      v.make?.toLowerCase() === String(fields.make ?? "").toLowerCase() &&
      v.model?.toLowerCase() === String(fields.model ?? "").toLowerCase() &&
      v.year === fields.year
  );

  if (combo.length === 1) {
    const v = combo[0];
    const importMileage =
      typeof fields.mileage === "number" ? fields.mileage : null;
    if (
      importMileage != null &&
      v.mileage != null &&
      Math.abs(v.mileage - importMileage) < 500
    ) {
      return { vehicleId: v.id, confidence: "high" };
    }
    if (fields.trim && v.trim && fields.trim === v.trim) {
      return { vehicleId: v.id, confidence: "medium" };
    }
    return { vehicleId: v.id, confidence: "low" };
  }

  return null;
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): { headers: string[]; dataRows: unknown[][] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (rows.length < 2) {
    throw new Error("EMPTY_FILE");
  }

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? ""));
  const dataRows = rows.slice(1).filter((r) =>
    (r as unknown[]).some((c) => c != null && String(c).trim() !== "")
  );

  return { headers, dataRows };
}

export async function buildImportPreview(params: {
  dealerId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<ImportPreview> {
  const { headers, dataRows } = parseSpreadsheetBuffer(params.buffer, params.fileName);
  const columnMapping = mapHeaders(headers);

  const existing = await prisma.vehicle.findMany({
    where: { dealerId: params.dealerId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      trim: true,
      mileage: true,
      rawInput: true,
    },
  });

  const rows: ImportRowPreview[] = dataRows.map((row, i) => {
    const fields = parseRow(row as unknown[], columnMapping);
    const warnings: string[] = [];

    if (!rowHasMinimum(fields)) {
      warnings.push("חסרים שדות מינימליים (יצרן/דגם/שנה)");
    }
    if (!fields.make) warnings.push("יצרן חסר");
    if (!fields.model) warnings.push("דגם חסר");
    if (!fields.year) warnings.push("שנתון חסר");

    const dup = findDuplicate(fields, existing);
    if (dup?.confidence === "low") {
      warnings.push("ייתכן כפילות — ייווצר רכב חדש");
    }

    const valid = rowHasMinimum(fields) && warnings.length === 0;

    return {
      rowIndex: i + 2,
      fields,
      valid,
      warnings,
      duplicateOfVehicleId: dup?.vehicleId ?? null,
      duplicateConfidence: dup?.confidence ?? null,
      skip: !rowHasMinimum(fields),
    };
  });

  const importedVehicleIds = new Set(
    rows
      .filter((r) => r.duplicateOfVehicleId && r.duplicateConfidence !== "low")
      .map((r) => r.duplicateOfVehicleId!)
  );

  const newCount = rows.filter(
    (r) => !r.skip && !r.duplicateOfVehicleId
  ).length;
  const stillActiveCount = importedVehicleIds.size;

  const missingFromFile = existing
    .filter((v) => !importedVehicleIds.has(v.id))
    .map((v) => ({
      vehicleId: v.id,
      label: [v.make, v.model, v.year].filter(Boolean).join(" ") || v.id,
    }));

  const importRecord = await prisma.inventoryImport.create({
    data: {
      dealerId: params.dealerId,
      sourceType: params.fileName.endsWith(".csv") ? "csv" : "xlsx",
      fileName: params.fileName,
      status: "PREVIEW",
      previewJson: toPrismaJson({
        headers,
        columnMapping,
        rows,
        diff: {
          newCount,
          stillActiveCount,
          missingFromFile,
        },
      }),
    },
  });

  return {
    importId: importRecord.id,
    fileName: params.fileName,
    columnMapping,
    headers,
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((r) => r.valid).length,
      needsAttention: rows.filter((r) => r.warnings.length > 0 && !r.skip).length,
      duplicates: rows.filter((r) => r.duplicateOfVehicleId).length,
    },
    diff: {
      newCount,
      stillActiveCount,
      missingFromFile,
    },
  };
}

function provenanceTag(fields: ImportRowPreview["fields"]): string {
  const tags: string[] = [];
  if (fields.dealerRefId) tags.push(`ref:${fields.dealerRefId}`);
  if (fields.vin) tags.push(`vin:${fields.vin}`);
  if (fields.licensePlate) tags.push(`plate:${fields.licensePlate}`);
  return tags.join(" ");
}

export async function confirmImport(params: {
  dealerId: string;
  importId: string;
  rowIndices?: number[];
  markMissingAsSold?: boolean;
}) {
  const importRecord = await prisma.inventoryImport.findFirst({
    where: { id: params.importId, dealerId: params.dealerId, status: "PREVIEW" },
  });
  if (!importRecord?.previewJson) throw new Error("NOT_FOUND");

  const preview = importRecord.previewJson as unknown as {
    rows: ImportRowPreview[];
  };

  const selected =
    params.rowIndices != null
      ? preview.rows.filter((r) => params.rowIndices!.includes(r.rowIndex))
      : preview.rows.filter((r) => !r.skip);

  let created = 0;
  let updated = 0;
  const touchedIds = new Set<string>();
  const now = new Date();

  for (const row of selected) {
    const tag = provenanceTag(row.fields);
    const fields = {
      make: (row.fields.make as string | null) ?? null,
      model: (row.fields.model as string | null) ?? null,
      trim: (row.fields.trim as string | null) ?? null,
      year: (row.fields.year as number | null) ?? null,
      mileage: (row.fields.mileage as number | null) ?? null,
      color: (row.fields.color as string | null) ?? null,
      b2bPrice: (row.fields.b2bPrice as number | null) ?? null,
      retailPrice: (row.fields.retailPrice as number | null) ?? null,
      region: (row.fields.region as string | null) ?? null,
      ownershipHand: (row.fields.ownershipHand as number | null) ?? null,
    };

    if (
      row.duplicateOfVehicleId &&
      row.duplicateConfidence !== "low"
    ) {
      const result = await updateVehicleForDealer({
        dealerId: params.dealerId,
        vehicleId: row.duplicateOfVehicleId,
        source: "import",
        skipEventLog: true,
        fields: {
          ...fields,
          status: "ACTIVE",
          rawInput: tag || null,
          lastAvailabilityConfirmedAt: now,
        },
      });
      if (!result.ok) {
        // Ownership / stale id — skip row; do not mutate foreign inventory
        continue;
      }
      touchedIds.add(row.duplicateOfVehicleId);
      updated += 1;
    } else if (!row.skip) {
      const result = await createVehicleForDealer({
        dealerId: params.dealerId,
        rawInput: tag || null,
        fields,
        source: "import",
        // Preserve import rowHasMinimum (OR) — not Agent hard identity gate
        requireIdentity: false,
        lastAvailabilityConfirmedAt: now,
      });
      if (!result.ok) {
        continue;
      }
      touchedIds.add(result.vehicle.id);
      created += 1;
    }
  }

  if (params.markMissingAsSold) {
    const stored = importRecord.previewJson as {
      diff?: { missingFromFile: Array<{ vehicleId: string }> };
    };
    for (const missing of stored.diff?.missingFromFile ?? []) {
      if (!touchedIds.has(missing.vehicleId)) {
        const result = await markVehicleSoldForDealer({
          dealerId: params.dealerId,
          vehicleId: missing.vehicleId,
          source: "import_diff",
        });
        // Domain service owns AppEvent logging for sold
        if (!result.ok) {
          continue;
        }
      }
    }
  }

  await prisma.inventoryImport.update({
    where: { id: params.importId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultJson: toPrismaJson({ created, updated }),
    },
  });

  await logAppEvent({
    eventType: "inventory_imported",
    dealerId: params.dealerId,
    entityType: "InventoryImport",
    entityId: params.importId,
    metadata: { created, updated },
  });

  const { recordActivationMilestone } = await import(
    "@/services/activation/milestones"
  );
  void recordActivationMilestone({
    dealerId: params.dealerId,
    milestone: "FIRST_INVENTORY_IMPORT_COMPLETED",
    entityType: "InventoryImport",
    entityId: params.importId,
    metadata: { created, updated },
  }).catch(() => undefined);

  return { created, updated };
}
