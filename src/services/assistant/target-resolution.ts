import "server-only";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AgentScope } from "@/services/assistant/capability-model";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";
import { prisma } from "@/lib/prisma";

export type ResolvedTarget = { id: string; title: string; extra?: Record<string, string> };

function ordinalIndex(reference: string | null): number | null {
  const t = (reference ?? "").trim();
  if (/ראשון|ראשונה|ההתאמה הראשונה/i.test(t)) return 0;
  if (/שני|שניה|השני/i.test(t)) return 1;
  if (/שלישי|שלישית/i.test(t)) return 2;
  return null;
}

function titleMatch(hay: string, needle: string): boolean {
  const a = hay.toLowerCase().replace(/[\s\-_]/g, "");
  const b = needle.toLowerCase().replace(/[\s\-_]/g, "");
  if (b.length < 2) return false;
  return a.includes(b) || b.includes(a.slice(0, Math.min(8, a.length)));
}

/** Server re-resolves authorized demand IDs. Client lastList is a hint only. */
export async function resolveAuthorizedDemands(params: {
  dealerId: string;
  scope: AgentScope | null;
  reference: string | null;
  conversation?: ConversationState;
  preferExpiring?: boolean;
}): Promise<ResolvedTarget[]> {
  const { results } = await executeToolsParallel(
    ["getMyActiveDemands", "getMyExpiringDemands"],
    params.dealerId
  );
  const active = (results.getMyActiveDemands ?? []) as Array<{
    id: string;
    title: string;
    uxStatus?: string;
  }>;
  const expiring = (results.getMyExpiringDemands ?? []) as Array<{
    id: string;
    title: string;
  }>;

  const authorized = new Set(active.map((d) => d.id));
  const hintIds = params.conversation?.lastAuthorizedSnapshot?.activeDemandIds ?? [];
  for (const id of hintIds) {
    if (!authorized.has(id)) {
      // ignore tampered / stale client IDs
    }
  }

  if (params.scope === "ALL_AUTHORIZED" || /כל|כולם|all/i.test(params.reference ?? "")) {
    return active.map((d) => ({ id: d.id, title: d.title }));
  }
  if (params.scope === "EXPIRED" || params.preferExpiring || /פג|שפגו|לפוג/i.test(params.reference ?? "")) {
    const ids = new Set(expiring.map((d) => d.id));
    return active
      .filter((d) => ids.has(d.id) || d.uxStatus === "EXPIRING")
      .map((d) => ({ id: d.id, title: d.title }));
  }

  const ord = ordinalIndex(params.reference);
  if (ord != null && active[ord]) return [{ id: active[ord].id, title: active[ord].title }];

  const ref = params.reference ?? "";
  if (ref) {
    const hits = active.filter((d) => titleMatch(d.title, ref));
    if (hits.length) return hits.map((d) => ({ id: d.id, title: d.title }));
  }

  const focused = params.conversation?.focusedObject;
  if (focused?.type === "demand" && authorized.has(focused.id)) {
    const row = active.find((d) => d.id === focused.id);
    if (row) return [{ id: row.id, title: row.title }];
  }

  if (params.scope === "ONE" && active.length === 1) {
    return [{ id: active[0].id, title: active[0].title }];
  }

  return [];
}

export async function assertDemandOwned(
  dealerId: string,
  demandId: string
): Promise<boolean> {
  const row = await prisma.demand.findFirst({
    where: { id: demandId, dealerId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function assertVehicleOwned(
  dealerId: string,
  vehicleId: string
): Promise<boolean> {
  const row = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function assertRevealOwned(
  dealerId: string,
  revealId: string
): Promise<boolean> {
  const row = await prisma.reveal.findFirst({
    where: {
      id: revealId,
      OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
    },
    select: { id: true },
  });
  return Boolean(row);
}
