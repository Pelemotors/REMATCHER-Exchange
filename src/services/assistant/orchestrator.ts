/**
 * Exchange Assistant v1 (regex intents) — NOT the production chat path.
 * Production uses runExchangeAssistantV2. Types below are shared.
 */

import {
  getEnrichedDemandsForDealer,
  getPendingActionsForDealer,
} from "@/services/demand/demand-queries";
import { logAppEvent } from "@/services/notifications";

export type AssistantIntent =
  | "MY_SEARCHES"
  | "PENDING_ACTIONS"
  | "CREATE_DEMAND_DRAFT"
  | "NAVIGATE"
  | "EXPLAIN_MATCH"
  | "UNKNOWN"
  | "FISHING_BLOCKED"
  | "CLOSE_DEMAND"
  | "UPDATE_DEMAND"
  | "VALIDATION"
  | "UPDATE_INVENTORY";

export interface AssistantContext {
  route: string;
  entityType?: string;
  entityId?: string;
  mode?: "inventory_management";
}

export interface AssistantResponse {
  message: string;
  intent: AssistantIntent;
  suggestions?: Array<{ label: string; href?: string; action?: string }>;
  requiresConfirmation?: {
    action: string;
    label: string;
    payload: Record<string, unknown>;
  };
  privacyBlocked?: boolean;
}

const FISHING_PATTERNS = [
  /כמה.*ברשת/i,
  /יש.*ברשת/i,
  /כמה רכבים/i,
  /יש למישהו/i,
  /כמה cx/i,
  /למה לא קיבלתי/i,
  /כמה כמעט/i,
  /תעלה תקציב/i,
];

function detectIntent(message: string): AssistantIntent {
  const m = message.trim();
  if (FISHING_PATTERNS.some((p) => p.test(m))) return "FISHING_BLOCKED";
  if (/מה אני מחפש|החיפושים שלי|חיפושים פעילים/i.test(m)) return "MY_SEARCHES";
  if (/מה מחכה|דורש טיפול|מה צריך/i.test(m)) return "PENDING_ACTIONS";
  if (/פתח.*חיפוש|תחפש|חיפוש ל/i.test(m)) return "CREATE_DEMAND_DRAFT";
  if (/למה.*התאמה|למה זו התאמה/i.test(m)) return "EXPLAIN_MATCH";
  if (/סיים|תפסיק|לא מחפש/i.test(m)) return "CLOSE_DEMAND";
  if (/תעלה|תקציב|עדכן/i.test(m)) return "UPDATE_DEMAND";
  if (/קח אותי|עבור ל|התאמות/i.test(m)) return "NAVIGATE";
  return "UNKNOWN";
}

export async function runExchangeAssistant(params: {
  dealerId: string;
  userId: string;
  message: string;
  context: AssistantContext;
}): Promise<AssistantResponse> {
  const intent = detectIntent(params.message);

  await logAppEvent({
    eventType: "assistant_intent_parsed",
    dealerId: params.dealerId,
    metadata: { intent, route: params.context.route },
  });

  if (intent === "FISHING_BLOCKED") {
    await logAppEvent({
      eventType: "assistant_privacy_block",
      dealerId: params.dealerId,
      metadata: { message: params.message.slice(0, 100) },
    });
    return {
      intent,
      privacyBlocked: true,
      message:
        "אני יכול לעזור עם החיפושים והפעילות שלך ב-Exchange, לא עם מלאי הרשת. רוצה שאפתח עבורך חיפוש חדש?",
      suggestions: [
        { label: "פתח חיפוש", href: "/demand?new=1" },
        { label: "החיפושים שלי", href: "/demand" },
      ],
    };
  }

  if (intent === "MY_SEARCHES") {
    const demands = await getEnrichedDemandsForDealer(params.dealerId);
    const active = demands.filter((d) =>
      ["ACTIVE", "EXPIRING"].includes(d.uxStatus)
    );
    if (active.length === 0) {
      return {
        intent,
        message: "אין לך חיפושים פעילים כרגע. אפשר לפתוח חיפוש חדש.",
        suggestions: [{ label: "פתח חיפוש", href: "/demand?new=1" }],
      };
    }
    const summary = active
      .map((d) => `• ${d.title}: ${d.reflection}`)
      .join("\n");
    return {
      intent,
      message: `יש לך ${active.length} חיפושים פעילים:\n${summary}`,
      suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
    };
  }

  if (intent === "PENDING_ACTIONS") {
    const { items, total } = await getPendingActionsForDealer(params.dealerId);
    if (total === 0) {
      return {
        intent,
        message: "אין כרגע דברים שדורשים טיפול מיידי. Exchange עובד ברקע.",
      };
    }
    const lines = items.map((i) => `• ${i.label} (${i.count})`).join("\n");
    return {
      intent,
      message: `יש לך ${total} דברים לטיפול:\n${lines}`,
      suggestions: items.map((i) => ({ label: i.label, href: i.href })),
    };
  }

  if (intent === "CREATE_DEMAND_DRAFT") {
    return {
      intent,
      message: "אפשר לפתוח חיפוש חדש. תאר מה אתה מחפש ונאשר איתך לפני הפעלה.",
      suggestions: [{ label: "פתח חיפוש", href: "/demand?new=1" }],
    };
  }

  if (intent === "NAVIGATE") {
    return {
      intent,
      message: "לאן תרצה לעבור?",
      suggestions: [
        { label: "התאמות", href: "/matches" },
        { label: "החיפושים שלי", href: "/demand" },
        { label: "פעילות", href: "/activity" },
      ],
    };
  }

  if (intent === "EXPLAIN_MATCH") {
    return {
      intent,
      message:
        "כדי להסביר התאמה, פתח את ההתאמה הרלוונטית ושאל שם — אסביר רק את מה שמורשה להצגה בכרטיס.",
      suggestions: [{ label: "התאמות שלי", href: "/matches" }],
    };
  }

  if (intent === "CLOSE_DEMAND" || intent === "UPDATE_DEMAND") {
    return {
      intent,
      message: "כדי לבצע שינוי בחיפוש, עבור לחיפוש הרלוונטי ואשר את הפעולה.",
      suggestions: [{ label: "החיפושים שלי", href: "/demand" }],
      requiresConfirmation: {
        action: intent === "CLOSE_DEMAND" ? "close_demand" : "update_demand",
        label: "נדרש אישור לפני ביצוע",
        payload: {},
      },
    };
  }

  return {
    intent: "UNKNOWN",
    message:
      "אני Exchange Assistant — יכול לעזור עם החיפושים, ההתאמות והפעולות שלך. נסה: ״מה אני מחפש?״ או ״מה מחכה לי?״",
    suggestions: [
      { label: "החיפושים שלי", href: "/demand" },
      { label: "מה מחכה לי?", action: "pending" },
      { label: "פתח חיפוש", href: "/demand?new=1" },
    ],
  };
}
