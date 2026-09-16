import "server-only";

/**
 * GOV / data.gov.il vehicle identity lookup.
 * Canonical ONLY for identity fields the official dataset provides
 * (make/model/year/trim/color/etc. as published). Never for asking price,
 * current mileage, or condition.
 *
 * Official source: Ministry of Transport via data.gov.il CKAN datastore_search.
 * Private/commercial is not enough — personal import, heavy, public, moto,
 * and inactive plates live in sibling resources (e.g. BMW 90563201).
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

/** Personal import (יבוא אישי) — e.g. US-spec BMW X5 90563201 */
export const GOV_PERSONAL_IMPORT_RESOURCE_ID =
  "03adc637-b6fe-402b-9937-7c3d3afc9140";

export const GOV_LOOKUP_RESOURCE_IDS = [
  GOV_ACTIVE_PRIVATE_RESOURCE_ID,
  GOV_PERSONAL_IMPORT_RESOURCE_ID,
  "cd3acc5c-03c3-4c89-9c54-d40f93c0d790", // heavy truck
  "cf29862d-ca25-4691-84f6-1be60dcb4a1e", // public transport
  "bf9df4e2-d90d-4c0a-a400-19e15af8e95f", // motorcycle
  "f6efe89a-fb3d-43a4-bb61-9bf12a9b9099", // inactive with insurance
  "6f6acd03-f351-4a8f-8ecf-df792f4f573a", // inactive without
] as const;

const GOV_ENDPOINT = "https://data.gov.il/api/3/action/datastore_search";
const GOV_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "REMATCHER-Exchange/1.0 (https://exchange.rematcher.co.il)",
};

export function isValidIsraeliPlate(normalizedDigits: string): boolean {
  const n = normalizedDigits.length;
  return n >= 7 && n <= 8 && /^\d+$/.test(normalizedDigits);
}

export function identityFromGovRecord(
  record: Record<string, unknown>,
  resourceId: string,
  normalizedPlate: string
): GovVehicleIdentity {
  const yearRaw = record.shnat_yitzur;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
        ? Number(yearRaw) || null
        : null;

  const degem = str(record.degem_nm);
  const tozeret = str(record.tozeret_nm);
  const kinuy = str(record.kinuy_mishari);
  const latinMake = degem?.match(/^[A-Za-z]{2,}/)?.[0] ?? null;

  return {
    plate: normalizedPlate,
    make: latinMake ?? tozeret ?? str(record.tozeret_eretz_nm),
    model:
      kinuy ??
      (degem && latinMake
        ? degem.slice(latinMake.length).trim() || degem
        : degem),
    year,
    color: str(record.tzeva_rechev) ?? str(record.tzeva_cd),
    trim: degem,
    raw: record,
    source: "data.gov.il",
    resourceId,
    lookedUpAt: new Date().toISOString(),
  };
}

export async function lookupVehicleByPlate(normalizedPlate: string): Promise<{
  state: GovLookupState;
  identity: GovVehicleIdentity | null;
}> {
  if (!isValidIsraeliPlate(normalizedPlate)) {
    return { state: "INVALID_PLATE", identity: null };
  }

  const plateNum = Number(normalizedPlate);
  let sawSuccess = false;
  let lastNetworkError = false;

  for (const resourceId of GOV_LOOKUP_RESOURCE_IDS) {
    const hit = await datastoreSearch(resourceId, { mispar_rechev: plateNum });
    if (hit.kind === "found") {
      return {
        state: "FOUND",
        identity: identityFromGovRecord(
          hit.record,
          resourceId,
          normalizedPlate
        ),
      };
    }
    if (hit.kind === "empty") sawSuccess = true;
    if (hit.kind === "error") lastNetworkError = true;
  }

  if (!sawSuccess && lastNetworkError) {
    return { state: "UNAVAILABLE", identity: null };
  }
  return { state: "NOT_FOUND", identity: null };
}

async function datastoreSearch(
  resourceId: string,
  filters: Record<string, string | number>
): Promise<
  | { kind: "found"; record: Record<string, unknown> }
  | { kind: "empty" }
  | { kind: "error" }
> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(GOV_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: GOV_HEADERS,
      body: JSON.stringify({
        resource_id: resourceId,
        filters,
        limit: 1,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as {
      success?: boolean;
      result?: { records?: Record<string, unknown>[] };
    };
    if (!data.success) return { kind: "error" };
    const record = data.result?.records?.[0];
    if (!record) return { kind: "empty" };
    return { kind: "found", record };
  } catch {
    return { kind: "error" };
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
