/**
 * Intake media is not always a vehicle photo.
 * Heuristic first; vision only when needed.
 */
export type IntakeInputKind =
  | "CUSTOMER_CONVERSATION"
  | "VEHICLE_PHOTO"
  | "VEHICLE_LISTING"
  | "DOCUMENT"
  | "UNKNOWN";

export type InputKindResult = {
  kind: IntakeInputKind;
  confidence: number;
  source: "heuristic" | "vision";
};

function aspectAndLayout(width?: number | null, height?: number | null) {
  if (!width || !height || width < 8 || height < 8) return null;
  return { ratio: height / width, portrait: height > width * 1.25 };
}

/**
 * Cheap prior: tall dark chat-like frames vs typical car photos.
 * Never treats UNKNOWN as vehicle by default.
 */
export function classifyInputKindHeuristic(input: {
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  accompanyingText?: string | null;
}): InputKindResult {
  const text = (input.accompanyingText ?? "").trim();
  const layout = aspectAndLayout(input.width, input.height);
  const demandish =
    /מחפש|צריך לקוח|יש לי לקוח|עד \d+|cx-?5|ראב\s*4|קורולה/i.test(text) &&
    !/לוחית|מספר רכב|צלם את הרכב/i.test(text);

  if (demandish && (!layout || layout.portrait)) {
    return { kind: "CUSTOMER_CONVERSATION", confidence: 0.72, source: "heuristic" };
  }

  if (layout?.portrait && layout.ratio >= 1.7) {
    return { kind: "CUSTOMER_CONVERSATION", confidence: 0.58, source: "heuristic" };
  }
  if (layout && !layout.portrait && layout.ratio < 0.85) {
    return { kind: "VEHICLE_PHOTO", confidence: 0.55, source: "heuristic" };
  }
  return { kind: "UNKNOWN", confidence: 0.4, source: "heuristic" };
}

export function shouldSkipVehicleOcr(kind: IntakeInputKind): boolean {
  return kind === "CUSTOMER_CONVERSATION" || kind === "DOCUMENT";
}

export function isConversationKind(kind: IntakeInputKind): boolean {
  return kind === "CUSTOMER_CONVERSATION";
}
