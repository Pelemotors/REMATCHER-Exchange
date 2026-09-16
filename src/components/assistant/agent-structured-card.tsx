"use client";

import Link from "next/link";
import { StatusBadge, VisibilityBadge } from "@/components/ui/brand-v2";
import type { AgentCard } from "@/components/assistant/agent-workspace-provider";
import styles from "./agent-workspace.module.css";

/**
 * Structured Agent cards — not ChatGPT paragraphs.
 */
export function AgentStructuredCard({
  card,
  onNavigate,
}: {
  card: AgentCard;
  onNavigate?: () => void;
}) {
  const tone =
    card.type === "network_insight" || card.type === "network"
      ? "network"
      : card.type === "customer" || card.type === "demand"
        ? "owned"
        : card.type === "vehicle"
          ? "offered"
          : card.type === "opportunity"
            ? "opportunity"
            : "private";

  return (
    <div className={styles.card}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge
          tone={tone}
          label={
            card.type === "vehicle"
              ? "רכב"
              : card.type === "customer"
                ? "לקוח"
                : card.type === "demand"
                  ? "חיפוש"
                  : card.type === "network_insight" || card.type === "network"
                    ? "רשת"
                    : card.type === "opportunity"
                      ? "הזדמנות"
                      : "תובנה"
          }
        />
        {card.meta?.visibility ? (
          <VisibilityBadge visibility={String(card.meta.visibility)} />
        ) : null}
      </div>
      <p className={styles.cardTitle}>{card.title}</p>
      {card.body && <p className={styles.cardBody}>{card.body}</p>}
      {card.href && (
        <Link href={card.href} className={styles.cardLink} onClick={onNavigate}>
          פתח
        </Link>
      )}
    </div>
  );
}
