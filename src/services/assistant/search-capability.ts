import "server-only";
import type { ConversationState } from "@/services/assistant/conversation-state";
import type { AgentMeta } from "@/services/assistant/tools/registry";
import type { AssistantResponse } from "@/services/assistant/orchestrator";
import type { AgentTurnPlan } from "@/services/assistant/agent-turn-plan";
import type { AgentScope } from "@/services/assistant/capability-model";
import { parseDemand } from "@/services/ai/demand-parser";
import {
  confirmedFromParsed,
  findDuplicateDemand,
} from "@/services/demand/duplicate-detection";
import type { DemandConfirmed } from "@/lib/demand-display";
import { demandSubtitle, demandTitle } from "@/lib/demand-display";
import { prisma } from "@/lib/prisma";
import {
  activateDemandForDealer,
  persistDemandDraftForDealer,
  updateDemandForDealer,
} from "@/services/demand/demand-mutations";
import {
  executeBulkDemandClosure,
  executeDemandClosure,
  executeDemandRenewal,
  prepareBulkDemandClosure,
  prepareDemandClosure,
  prepareDemandRenewal,
} from "@/services/assistant/tools/action-tools";
import {
  resolveAuthorizedDemands,
  assertDemandOwned,
} from "@/services/assistant/target-resolution";
import { executeToolsParallel } from "@/services/assistant/tools/read-tools";

type AssistantV2Response = AssistantResponse & {
  conversation?: ConversationState;
  meta?: AgentMeta;
};

function applyFacts(
  base: DemandConfirmed,
  plan: AgentTurnPlan
): DemandConfirmed {
  const next = { ...base };
  for (const f of [...plan.facts.add, ...plan.facts.correct]) {
    const field = f.field.toLowerCase();
    const v = f.value;
    if (v == null) continue;
    if (field === "make") next.make = String(v);
    else if (field === "model") next.model = String(v);
    else if (field === "year" || field === "yearmin") next.yearMin = Number(v);
    else if (field === "yearmax") next.yearMax = Number(v);
    else if (field === "budget" || field === "budgetmax" || field === "price") {
      const n = Number(v);
      next.budgetMax = n < 1000 ? n * 1000 : n;
    }
  }
  return next;
}

function summarize(confirmed: DemandConfirmed): string {
  const title = demandTitle(confirmed);
  const sub = demandSubtitle(confirmed);
  return sub ? `${title} · ${sub}` : title;
}

function withDraft(
  conversation: ConversationState | undefined,
  extra: ConversationState
): ConversationState {
  return {
    ...conversation,
    ...extra,
    pendingInventoryDraft: conversation?.pendingInventoryDraft,
    pendingInventoryMutation: conversation?.pendingInventoryMutation,
    sessionContext: conversation?.sessionContext,
    suspendedContext: conversation?.suspendedContext,
    queuedFollowUp: extra.queuedFollowUp ?? conversation?.queuedFollowUp,
  };
}

export async function handleSearchCapability(params: {
  dealerId: string;
  userId: string;
  message: string;
  plan: AgentTurnPlan;
  operation: "READ" | "CREATE" | "UPDATE" | "CLOSE" | "RENEW";
  scope: AgentScope | null;
  conversation?: ConversationState;
  meta: AgentMeta;
}): Promise<AssistantV2Response> {
  const { dealerId, userId, message, plan, operation, scope, conversation, meta } =
    params;
  const queued =
    plan.conversation.queuedFollowUp ?? conversation?.queuedFollowUp ?? undefined;

  if (operation === "READ") {
    const tools =
      scope === "EXPIRED"
        ? (["getMyExpiringDemands", "getMyActiveDemands"] as const)
        : (["getMyActiveDemands", "getMyExpiringDemands"] as const);
    meta.tools = [...meta.tools, ...tools];
    const { results } = await executeToolsParallel([...tools], dealerId);
    const active = (results.getMyActiveDemands ?? []) as Array<{
      id: string;
      title: string;
      daysLeft?: number;
    }>;
    meta.responseType = "search_read";
    meta.legacyPlannerUsed = false;
    const lines = active
      .slice(0, 8)
      .map((d, i) => `${i + 1}. ${d.title}${d.daysLeft != null ? ` (${d.daysLeft} ימים)` : ""}`);
    return {
      intent: "MY_SEARCHES",
      message:
        active.length === 0
          ? "אין לך חיפושים פעילים כרגע."
          : `יש לך ${active.length} חיפושים פעילים:\n${lines.join("\n")}`,
      conversation: withDraft(conversation, {
        lastList: active.map((d) => ({
          id: d.id,
          title: d.title,
          type: "demand",
        })),
        lastAuthorizedSnapshot: {
          ...conversation?.lastAuthorizedSnapshot,
          activeDemandCount: active.length,
          activeDemandIds: active.map((d) => d.id),
          activeDemandTitles: active.map((d) => d.title),
        },
        pendingSearchDraft: conversation?.pendingSearchDraft,
      }),
      meta,
    };
  }

  if (operation === "CREATE") {
    const existingDraftId = conversation?.pendingSearchDraft?.demandId;
    if (existingDraftId && (await assertDemandOwned(dealerId, existingDraftId))) {
      const parsed = await parseDemand(message, userId);
      const merged = applyFacts(
        {
          ...conversation!.pendingSearchDraft!.confirmed,
          ...confirmedFromParsed(parsed as unknown as Record<string, unknown>),
        },
        plan
      );
      await updateDemandForDealer({
        dealerId,
        demandId: existingDraftId,
        confirmed: merged,
      });
      const ready = Boolean(merged.make && merged.model);
      meta.responseType = ready ? "search_draft_ready" : "search_draft";
      const label = `לפתוח חיפוש "${summarize(merged)}"?`;
      return {
        intent: "CREATE_DEMAND_DRAFT",
        message: ready
          ? `רשמתי: ${summarize(merged)}. ${label}`
          : `קיבלתי. בינתיים: ${summarize(merged) || "חיפוש בתהליך"}. חסר לי יצרן או דגם כדי לפתוח חיפוש שימושי.`,
        requiresConfirmation: ready
          ? { action: "activate_demand", label, payload: { demandId: existingDraftId } }
          : undefined,
        conversation: withDraft(conversation, {
          pendingSearchDraft: {
            demandId: existingDraftId,
            status: "PENDING_CONFIRMATION",
            sourceText: message,
            confirmed: merged,
          },
          pendingConfirmation: ready
            ? {
                action: "activate_demand",
                label,
                payload: { demandId: existingDraftId, queuedFollowUp: queued },
              }
            : conversation?.pendingConfirmation,
          queuedFollowUp: queued,
        }),
        meta,
      };
    }

    const parsed = await parseDemand(message, userId);
    const confirmed = applyFacts(
      confirmedFromParsed(parsed as unknown as Record<string, unknown>),
      plan
    );
    const existing = await prisma.demand.findMany({
      where: {
        dealerId,
        status: { in: ["ACTIVE", "PENDING_CONFIRMATION", "DRAFT"] },
      },
      select: { id: true, status: true, confirmedJson: true },
    });
    const dup = findDuplicateDemand(confirmed, existing);
    if (dup.level === "NEARLY_IDENTICAL" && dup.existingDemandId) {
      meta.responseType = "search_duplicate";
      return {
        intent: "CREATE_DEMAND_DRAFT",
        message:
          "כבר יש לך חיפוש כמעט זהה. אפשר לעדכן את הקיים, או לאשר במפורש לפתוח חדש.",
        conversation: withDraft(conversation, {
          lastList: [
            {
              id: dup.existingDemandId,
              title: demandTitle(confirmed),
              type: "demand",
            },
          ],
        }),
        meta,
      };
    }

    const row = await persistDemandDraftForDealer({
      dealerId,
      rawText: message,
      parsed,
      confirmed,
    });
    const ready = Boolean(confirmed.make && confirmed.model);
    const label = `לפתוח חיפוש "${summarize(confirmed)}"?`;
    meta.responseType = ready ? "search_draft_ready" : "search_draft";
    return {
      intent: "CREATE_DEMAND_DRAFT",
      message: ready
        ? `רשמתי חיפוש: ${summarize(confirmed)}. ${label}`
        : `פתחתי טיוטת חיפוש. חסר לי יצרן או דגם — מה לחפש?`,
      requiresConfirmation: ready
        ? {
            action: "activate_demand",
            label,
            payload: { demandId: row.id, queuedFollowUp: queued },
          }
        : undefined,
      conversation: withDraft(conversation, {
        pendingSearchDraft: {
          demandId: row.id,
          status: "PENDING_CONFIRMATION",
          sourceText: message,
          confirmed,
        },
        pendingConfirmation: ready
          ? {
              action: "activate_demand",
              label,
              payload: { demandId: row.id, queuedFollowUp: queued },
            }
          : undefined,
        queuedFollowUp: queued,
      }),
      meta,
    };
  }

  if (operation === "UPDATE") {
    const targets = await resolveAuthorizedDemands({
      dealerId,
      scope: scope ?? "ONE",
      reference: plan.action.targetReference ?? plan.understanding.targetReference,
      conversation,
    });
    if (targets.length !== 1) {
      meta.responseType = "search_update_clarify";
      return {
        intent: "UPDATE_DEMAND",
        message:
          targets.length === 0
            ? "לא מצאתי חיפוש מאושר לעדכון. אפשר לציין דגם או לבחור מהרשימה."
            : `מצאתי כמה חיפושים (${targets.map((t) => t.title).join(", ")}). איזה לעדכן?`,
        conversation: withDraft(conversation, {
          lastList: targets.map((t) => ({
            id: t.id,
            title: t.title,
            type: "demand",
          })),
        }),
        meta,
      };
    }
    const owned = await assertDemandOwned(dealerId, targets[0].id);
    if (!owned) {
      return {
        intent: "UPDATE_DEMAND",
        message: "אין הרשאה לעדכן את החיפוש הזה.",
        meta,
      };
    }
    const current = await prisma.demand.findFirst({
      where: { id: targets[0].id, dealerId },
    });
    const parsed = await parseDemand(message, userId);
    const merged = applyFacts(
      {
        ...((current?.confirmedJson ?? {}) as DemandConfirmed),
        ...confirmedFromParsed(parsed as unknown as Record<string, unknown>),
      },
      plan
    );
    const label = `לעדכן את "${targets[0].title}" ל־${summarize(merged)}?`;
    meta.responseType = "confirmation_update_demand";
    return {
      intent: "UPDATE_DEMAND",
      message: label,
      requiresConfirmation: {
        action: "update_demand",
        label,
        payload: { demandId: targets[0].id, confirmed: merged, queuedFollowUp: queued },
      },
      conversation: withDraft(conversation, {
        pendingConfirmation: {
          action: "update_demand",
          label,
          payload: { demandId: targets[0].id, confirmed: merged, queuedFollowUp: queued },
        },
      }),
      meta,
    };
  }

  if (operation === "CLOSE") {
    if (scope === "ALL_AUTHORIZED" || scope === "EXPIRED" || scope === "MANY") {
      if (scope === "EXPIRED") {
        const targets = await resolveAuthorizedDemands({
          dealerId,
          scope: "EXPIRED",
          reference: plan.action.targetReference,
          conversation,
          preferExpiring: true,
        });
        if (!targets.length) {
          return {
            intent: "CLOSE_DEMAND",
            message: "אין חיפושים שפגו לסגור.",
            meta,
          };
        }
        const label = `לסגור ${targets.length} חיפושים שפגו (${targets.map((t) => t.title).join(", ")})?`;
        meta.responseType = "confirmation_close";
        return {
          intent: "CLOSE_DEMAND",
          message: label,
          requiresConfirmation: {
            action: "close_demands_bulk",
            label,
            payload: {
              demandIds: targets.map((t) => t.id),
              queuedFollowUp: queued,
            },
          },
          conversation: withDraft(conversation, {
            pendingConfirmation: {
              action: "close_demands_bulk",
              label,
              payload: {
                demandIds: targets.map((t) => t.id),
                queuedFollowUp: queued,
              },
            },
          }),
          meta,
        };
      }
      const prep = await prepareBulkDemandClosure(dealerId);
      meta.responseType = "confirmation_close";
      if (prep.empty) {
        return {
          intent: "CLOSE_DEMAND",
          message: "אין לך חיפושים פעילים לסגור כרגע.",
          conversation: withDraft(conversation, {
            lastAuthorizedSnapshot: {
              ...conversation?.lastAuthorizedSnapshot,
              activeDemandCount: 0,
              activeDemandIds: [],
              activeDemandTitles: [],
            },
          }),
          meta,
        };
      }
      return {
        intent: "CLOSE_DEMAND",
        message: prep.label,
        requiresConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: { ...prep.payload, queuedFollowUp: queued },
        },
        conversation: withDraft(conversation, {
          lastAuthorizedSnapshot: {
            activeDemandCount: prep.demands.length,
            activeDemandIds: prep.demands.map((d) => d.id),
            activeDemandTitles: prep.demands.map((d) => d.title),
          },
          pendingConfirmation: {
            action: prep.action,
            label: prep.label,
            payload: { ...prep.payload, queuedFollowUp: queued },
          },
        }),
        meta,
      };
    }

    const targets = await resolveAuthorizedDemands({
      dealerId,
      scope: scope ?? "ONE",
      reference: plan.action.targetReference ?? plan.understanding.targetReference,
      conversation,
    });
    if (targets.length !== 1) {
      return {
        intent: "CLOSE_DEMAND",
        message:
          targets.length === 0
            ? "לא מצאתי חיפוש מאושר לסגור."
            : "מצאתי כמה חיפושים. איזה לסגור?",
        conversation: withDraft(conversation, {
          lastList: targets.map((t) => ({
            id: t.id,
            title: t.title,
            type: "demand",
          })),
        }),
        meta,
      };
    }
    const prep = await prepareDemandClosure(dealerId, targets[0].id);
    if (!prep.ok) {
      return { intent: "CLOSE_DEMAND", message: "לא מצאתי את החיפוש.", meta };
    }
    meta.responseType = "confirmation_close";
    return {
      intent: "CLOSE_DEMAND",
      message: prep.label,
      requiresConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: { ...prep.payload, queuedFollowUp: queued },
      },
      conversation: withDraft(conversation, {
        pendingConfirmation: {
          action: prep.action,
          label: prep.label,
          payload: { ...prep.payload, queuedFollowUp: queued },
        },
      }),
      meta,
    };
  }

  // RENEW
  const targets = await resolveAuthorizedDemands({
    dealerId,
    scope: scope ?? "ONE",
    reference: plan.action.targetReference ?? plan.understanding.targetReference,
    conversation,
    preferExpiring: true,
  });
  if (targets.length !== 1) {
    return {
      intent: "UPDATE_DEMAND",
      message:
        targets.length === 0
          ? "לא מצאתי חיפוש לחידוש."
          : "איזה חיפוש לחדש?",
      conversation: withDraft(conversation, {
        lastList: targets.map((t) => ({
          id: t.id,
          title: t.title,
          type: "demand",
        })),
      }),
      meta,
    };
  }
  const prep = await prepareDemandRenewal(dealerId, targets[0].id);
  if (!prep.ok) {
    return { intent: "UPDATE_DEMAND", message: "לא מצאתי את החיפוש.", meta };
  }
  meta.responseType = "confirmation_renew";
  return {
    intent: "UPDATE_DEMAND",
    message: prep.label,
    requiresConfirmation: {
      action: prep.action,
      label: prep.label,
      payload: { ...prep.payload, queuedFollowUp: queued },
    },
    conversation: withDraft(conversation, {
      pendingConfirmation: {
        action: prep.action,
        label: prep.label,
        payload: { ...prep.payload, queuedFollowUp: queued },
      },
    }),
    meta,
  };
}

export async function executeSearchMutation(params: {
  dealerId: string;
  pending: NonNullable<ConversationState["pendingConfirmation"]>;
  conversation?: ConversationState;
  meta: AgentMeta;
}): Promise<AssistantV2Response | null> {
  const { dealerId, pending, conversation, meta } = params;
  const demandId = pending.payload.demandId as string | undefined;
  const demandIds = pending.payload.demandIds as string[] | undefined;

  if (pending.action === "activate_demand" && demandId) {
    if (!(await assertDemandOwned(dealerId, demandId))) {
      return { intent: "CREATE_DEMAND_DRAFT", message: "אין הרשאה לחיפוש הזה.", meta };
    }
    const result = await activateDemandForDealer({ dealerId, demandId });
    meta.responseType = "mutation_activate_demand";
    if (!result.ok) {
      return { intent: "CREATE_DEMAND_DRAFT", message: "לא הצלחתי לפתוח את החיפוש.", meta };
    }
    return {
      intent: "CREATE_DEMAND_DRAFT",
      message: `פתחתי את החיפוש "${result.title}". Exchange מחפש התאמות לפי הכללים.`,
      conversation: {
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        sessionContext: conversation?.sessionContext,
        queuedFollowUp: pending.payload.queuedFollowUp as string | undefined,
      },
      meta,
    };
  }

  if (pending.action === "update_demand" && demandId) {
    if (!(await assertDemandOwned(dealerId, demandId))) {
      return { intent: "UPDATE_DEMAND", message: "אין הרשאה לעדכן את החיפוש הזה.", meta };
    }
    const confirmed = pending.payload.confirmed as DemandConfirmed;
    const result = await updateDemandForDealer({ dealerId, demandId, confirmed });
    meta.responseType = "mutation_update_demand";
    if (!result.ok) {
      return { intent: "UPDATE_DEMAND", message: "לא הצלחתי לעדכן את החיפוש.", meta };
    }
    return {
      intent: "UPDATE_DEMAND",
      message: `עדכנתי את החיפוש "${result.title}".`,
      conversation: {
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        sessionContext: conversation?.sessionContext,
      },
      meta,
    };
  }

  if (pending.action === "close_demands_bulk") {
    const ids = demandIds ?? [];
    const owned: string[] = [];
    for (const id of ids) {
      if (await assertDemandOwned(dealerId, id)) owned.push(id);
    }
    const result = await executeBulkDemandClosure(dealerId, owned);
    meta.responseType = "mutation_close";
    return {
      intent: "CLOSE_DEMAND",
      message:
        result.closed > 0
          ? `סגרתי ${result.closed} חיפושים פעילים.`
          : "לא הצלחתי לסגור את החיפושים.",
      conversation: {
        lastAuthorizedSnapshot: {
          activeDemandCount: 0,
          activeDemandIds: [],
          activeDemandTitles: [],
        },
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        sessionContext: conversation?.sessionContext,
      },
      meta,
    };
  }

  if (pending.action === "close_demand" && demandId) {
    if (!(await assertDemandOwned(dealerId, demandId))) {
      return { intent: "CLOSE_DEMAND", message: "אין הרשאה לסגור את החיפוש הזה.", meta };
    }
    const result = await executeDemandClosure(dealerId, demandId);
    meta.responseType = "mutation_close";
    if (!result.ok) {
      return { intent: "CLOSE_DEMAND", message: "לא הצלחתי לסגור את החיפוש.", meta };
    }
    return {
      intent: "CLOSE_DEMAND",
      message: "סגרתי את החיפוש.",
      conversation: {
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        sessionContext: conversation?.sessionContext,
      },
      meta,
    };
  }

  if (pending.action === "renew_demand" && demandId) {
    if (!(await assertDemandOwned(dealerId, demandId))) {
      return { intent: "UPDATE_DEMAND", message: "אין הרשאה לחדש את החיפוש הזה.", meta };
    }
    const result = await executeDemandRenewal(dealerId, demandId);
    meta.responseType = "mutation_renew";
    if (!result.ok) {
      return { intent: "UPDATE_DEMAND", message: "לא הצלחתי לחדש את החיפוש.", meta };
    }
    return {
      intent: "UPDATE_DEMAND",
      message: `חידשתי את "${result.demand?.title ?? "החיפוש"}".`,
      conversation: {
        pendingInventoryDraft: conversation?.pendingInventoryDraft,
        sessionContext: conversation?.sessionContext,
      },
      meta,
    };
  }

  return null;
}
