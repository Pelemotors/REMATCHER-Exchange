import { BadgeV2 } from "./badge-v2";
import { COPY } from "@/config/brand";

/** Match quality band — NOT Exchange Mark semantics */
export function StatusBadgeV2({
  band,
}: {
  band?: "STRONG" | "GOOD" | "ALTERNATIVE" | null;
}) {
  if (band === "STRONG") {
    return <BadgeV2 variant="signal">{COPY.matchStrong}</BadgeV2>;
  }
  if (band === "GOOD") {
    return <BadgeV2 variant="signal">התאמה טובה</BadgeV2>;
  }
  if (band === "ALTERNATIVE") {
    return <BadgeV2 variant="neutral">{COPY.matchPossible}</BadgeV2>;
  }
  return null;
}
