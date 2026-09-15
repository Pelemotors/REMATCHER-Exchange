import "server-only";

/**
 * GOV / data.gov.il vehicle identity lookup.
 * Canonical ONLY for identity fields the official dataset provides
 * (make/model/year/trim/color/etc. as published). Never for asking price,
 * current mileage, or condition.
 *
 * Official source: Ministry of Transport via data.gov.il CKAN datastore_search.
 * Resource ID verified at implementation time against the public dataset page.
 */

export type GovLookupState =
  | "FOUND"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "INVALID_PLATE";

export type GovVehicleIdentity = {
  plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  trim: string | null;
  raw: Record<string, unknown>;
  source: "data.gov.il";
  resourceId: string;
  lookedUpAt: string;
};

/** Active private/commercial vehicles — Ministry of Transport open data */
export const GOV_ACTIVE_PRIVATE_RESOURCE_ID =
  "053cea08-09bc-40ec-8f7a-156f0677aff3";

const GOV_ENDPOINT = "https://data.gov.il/api/3/action/datastore_search";

export function isValidIsraeliPlate(normalizedDigits: string): boolean {
  const n = normalizedDigits.length;
  return n >= 7 && n <= 8 && /^\d+$/.test(normalizedDigits);
}

export async function lookupVehicleByPlate(normalizedPlate: string): Promise<{
  state: GovLookupState;
  identity: GovVehicleIdentity | null;
}> {
  if (!isValidIsraeliPlate(normalizedPlate)) {
    return { state: "INVALID_PLATE", identity: null };
  }

  const url = new URL(GOV_ENDPOINT);
  url.searchParams.set("resource_id", GOV_ACTIVE_PRIVATE_RESOURCE_ID);
  url.searchParams.set("limit", "1");
  url.searchParams.set(
    "filters",
    JSON.stringify({ mispar_rechev: Number(normalizedPlate) })
  );

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { state: "UNAVAILABLE", identity: null };
    }
    const data = (await res.json()) as {
      success?: boolean;
      result?: { records?: Record<string, unknown>[] };
    };
    if (!data.success) {
      return { state: "UNAVAILABLE", identity: null };
    }
    const record = data.result?.records?.[0];
    if (!record) {
      return { state: "NOT_FOUND", identity: null };
    }

    const yearRaw = record.shnat_yitzur;
    const year =
      typeof yearRaw === "number"
        ? yearRaw
        : typeof yearRaw === "string"
          ? Number(yearRaw) || null
          : null;

    return {
      state: "FOUND",
      identity: {
        plate: normalizedPlate,
        make: str(record.tozeret_nm) ?? str(record.tozeret_eretz_nm),
        model: str(record.kinuy_mishari) ?? str(record.degem_nm),
        year,
        color: str(record.tzeva_rechev) ?? str(record.tzeva_cd),
        trim: str(record.degem_nm),
        raw: record,
        source: "data.gov.il",
        resourceId: GOV_ACTIVE_PRIVATE_RESOURCE_ID,
        lookedUpAt: new Date().toISOString(),
      },
    };
  } catch {
    return { state: "UNAVAILABLE", identity: null };
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
