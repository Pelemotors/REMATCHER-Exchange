import "server-only";
import { prisma } from "@/lib/prisma";
import { BUYER_VISIBLE_MATCH_WHERE } from "@/services/domain/candidate-policy";

export type ActionCenterType =
  | "BUYER_MATCH"
  | "SELLER_OPPORTUNITY"
  | "REVEAL_READY"
  | "DEALER_OPPORTUNITY"
  | "DECISION_MISSING_INFO"
  | "VALIDATION"
  | "INFORMATION_REQUEST"
  | "CATALOG_LEAD";

export type ActionCenterItem = {
  id: string;
  type: ActionCenterType;
  title: string;
  priority: 1 | 2 | 3 | 4;
  entityType: string;
  entityId: string;
  href: string;
  createdAt: string;
  urgent: boolean;
};

export function decisionMissingReasons(row: {
  type: string;
  outgoingVehicleId?: string | null;
  incomingAgreedPrice?: number | null;
  incomingAskPrice?: number | null;
}): string[] {
  const missing: string[] = [];
  if (row.type === "TRADE" && !row.outgoingVehicleId) missing.push("outgoing");
  if (row.type === "TRADE" && row.incomingAgreedPrice == null) missing.push("allowance");
  if (row.type === "PURCHASE" && row.incomingAskPrice == null) missing.push("ask");
  return missing;
}

export function sortActionCenterItems(items: ActionCenterItem[]): ActionCenterItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * 1 = blocked on me
 * 2 = new opportunity
 * 3 = open Decision needs work
 * 4 = missing information
 */
export async function getActionCenter(dealerId: string): Promise<{
  items: ActionCenterItem[];
  generatedAt: string;
}> {
  const [
    buyerMatches,
    sellerOpps,
    reveals,
    dealerOpps,
    openDecisions,
    validations,
    infoRequests,
    catalogLeads,
  ] = await Promise.all([
    prisma.candidateMatch.findMany({
      where: {
        demand: { dealerId, status: "ACTIVE" },
        ...BUYER_VISIBLE_MATCH_WHERE,
        buyerInterests: { none: { dealerId, status: { in: ["INTERESTED", "REJECTED"] } } },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.sellerOpportunity.findMany({
      where: { vehicle: { dealerId, status: "ACTIVE" }, status: "OPEN" },
      select: { id: true, createdAt: true, vehicleId: true, candidateMatchId: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.reveal.findMany({
      where: {
        OR: [{ buyerDealerId: dealerId }, { sellerDealerId: dealerId }],
        outcome: null,
      },
      select: { id: true, revealedAt: true },
      orderBy: { revealedAt: "desc" },
      take: 10,
    }),
    prisma.dealerOpportunity.findMany({
      where: { dealerId, status: "OPEN" },
      select: {
        id: true,
        createdAt: true,
        type: true,
        title: true,
        vehicleId: true,
        demandId: true,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.vehicleDecision.findMany({
      where: { dealerId, status: "OPEN" },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        openedAt: true,
        outgoingVehicleId: true,
        incomingAgreedPrice: true,
        incomingAskPrice: true,
      },
    }),
    prisma.validationEvent.findMany({
      where: { dealerId, status: "PENDING" },
      select: { id: true, requestedAt: true, vehicleId: true },
      take: 20,
    }),
    prisma.informationRequest.findMany({
      where: { status: "OPEN", vehicle: { dealerId } },
      select: { id: true, createdAt: true, candidateMatchId: true },
      take: 20,
    }),
    prisma.catalogLead.findMany({
      where: { dealerId, status: "NEW" },
      select: { id: true, createdAt: true },
      take: 20,
    }),
  ]);

  const items: ActionCenterItem[] = [];
  const claimed = new Set<string>();

  for (const row of sellerOpps) {
    const id = `SELLER_OPPORTUNITY:${row.id}`;
    claimed.add(`match:${row.candidateMatchId}`);
    claimed.add(`vehicle:${row.vehicleId}`);
    items.push({
      id,
      type: "SELLER_OPPORTUNITY",
      title: "יש עניין ברכב שלך",
      priority: 1,
      entityType: "SellerOpportunity",
      entityId: row.id,
      href: `/opportunities?focus=${row.id}`,
      createdAt: row.createdAt.toISOString(),
      urgent: true,
    });
  }

  for (const row of reveals) {
    items.push({
      id: `REVEAL_READY:${row.id}`,
      type: "REVEAL_READY",
      title: "אפשר לפתוח פרטים",
      priority: 1,
      entityType: "Reveal",
      entityId: row.id,
      href: `/reveals/${row.id}`,
      createdAt: row.revealedAt.toISOString(),
      urgent: true,
    });
  }

  for (const row of validations) {
    items.push({
      id: `VALIDATION:${row.id}`,
      type: "VALIDATION",
      title: "נדרש אימות זמינות או מחיר",
      priority: 1,
      entityType: "ValidationEvent",
      entityId: row.id,
      href: `/validations?focus=${row.vehicleId}`,
      createdAt: row.requestedAt.toISOString(),
      urgent: true,
    });
  }

  for (const row of buyerMatches) {
    if (claimed.has(`match:${row.id}`)) continue;
    claimed.add(`match:${row.id}`);
    items.push({
      id: `BUYER_MATCH:${row.id}`,
      type: "BUYER_MATCH",
      title: "מצאתי התאמה",
      priority: 2,
      entityType: "CandidateMatch",
      entityId: row.id,
      href: `/matches/${row.id}`,
      createdAt: row.createdAt.toISOString(),
      urgent: false,
    });
  }

  for (const row of openDecisions) {
    const missing = decisionMissingReasons(row);
    if (missing.length === 0) continue;
    items.push({
      id: `DECISION_MISSING_INFO:${row.id}`,
      type: "DECISION_MISSING_INFO",
      title:
        row.type === "TRADE"
          ? "חסרים פרטי טרייד כדי להמשיך"
          : "חסר מחיר לרכב שאתה שוקל לקנות",
      priority: 3,
      entityType: "VehicleDecision",
      entityId: row.id,
      href: `/inventory/${row.vehicleId}`,
      createdAt: row.openedAt.toISOString(),
      urgent: true,
    });
  }

  for (const row of infoRequests) {
    items.push({
      id: `INFORMATION_REQUEST:${row.id}`,
      type: "INFORMATION_REQUEST",
      title: "חסר מידע שמונע התקדמות",
      priority: 4,
      entityType: "InformationRequest",
      entityId: row.id,
      href: `/inventory?enrich=1&focus=${row.candidateMatchId}`,
      createdAt: row.createdAt.toISOString(),
      urgent: false,
    });
  }

  for (const row of catalogLeads) {
    items.push({
      id: `CATALOG_LEAD:${row.id}`,
      type: "CATALOG_LEAD",
      title: "פנייה חדשה מהקטלוג",
      priority: 2,
      entityType: "CatalogLead",
      entityId: row.id,
      href: `/customers?lead=${row.id}`,
      createdAt: row.createdAt.toISOString(),
      urgent: false,
    });
  }

  for (const row of dealerOpps) {
    const keys = [
      row.vehicleId ? `vehicle:${row.vehicleId}` : null,
      row.demandId ? `demand:${row.demandId}` : null,
    ].filter(Boolean) as string[];
    if (keys.some((k) => claimed.has(k))) continue;
    items.push({
      id: `DEALER_OPPORTUNITY:${row.id}`,
      type: "DEALER_OPPORTUNITY",
      title: row.title,
      priority: 2,
      entityType: "DealerOpportunity",
      entityId: row.id,
      href: `/opportunities?focus=${row.id}`,
      createdAt: row.createdAt.toISOString(),
      urgent: false,
    });
  }

  return { items: sortActionCenterItems(items), generatedAt: new Date().toISOString() };
}
