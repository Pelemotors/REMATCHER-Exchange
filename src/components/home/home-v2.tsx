"use client";

import Link from "next/link";
import { Camera, ChevronLeft, Package, Search, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { CreateDemandFlow } from "@/components/demand/create-demand-flow";
import { Surface } from "@/components/ui/brand-v2";
import { useAgentWorkspaceOptional } from "@/components/assistant/agent-workspace-provider";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";
import styles from "./home-v2.module.css";

export interface HomeV2ActionItem {
  href: string;
  label: string;
  count: number;
  urgent?: boolean;
}

export interface HomeV2SetupStatus {
  hasInventory: boolean;
  hasActiveDemand: boolean;
  pushEnabled: boolean;
  inventoryCount: number;
  activeDemandCount: number;
  shouldShowOnboarding: boolean;
}

export interface HomeV2Props {
  dealerName: string | null;
  userName?: string | null;
  blockers: HomeV2ActionItem[];
  setupStatus: HomeV2SetupStatus;
  attention?: {
    opportunities: number;
    matches: number;
    validations: number;
  };
}

function greetingHe() {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

export function HomeV2({
  dealerName,
  userName,
  blockers,
  setupStatus,
  attention,
}: HomeV2Props) {
  const agent = useAgentWorkspaceOptional();
  const urgentBlockers = blockers.filter((b) => b.urgent);
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;

  const attentionCards = [
    attention?.opportunities
      ? {
          href: "/opportunities",
          label: "הזדמנויות",
          count: attention.opportunities,
          tone: "opportunity" as const,
        }
      : null,
    attention?.matches
      ? {
          href: "/matches",
          label: "התאמות חדשות",
          count: attention.matches,
          tone: "success" as const,
        }
      : null,
    attention?.validations
      ? {
          href: "/validations",
          label: "דורש אימות",
          count: attention.validations,
          tone: "warning" as const,
        }
      : null,
    setupStatus.activeDemandCount > 0
      ? {
          href: "/demand",
          label: "חיפושים פעילים",
          count: setupStatus.activeDemandCount,
          tone: "info" as const,
        }
      : null,
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    count: number;
    tone: "opportunity" | "success" | "warning" | "info";
  }>;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.identity}>
          <BrandMark
            size={36}
            variant="gold"
            preferPng
            className={styles.mark}
          />
          <div>
            <p className={styles.hello}>
              {greetingHe()}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <p className={styles.dealerLine}>
              {dealerName ?? BRAND.product}
            </p>
          </div>
        </div>
        <Link
          href="/activity"
          className={styles.bell}
          aria-label="התראות ופעילות"
        />
      </header>

      <section className={styles.heroBrand} aria-label="REMATCHER Exchange">
        <BrandMark size={56} variant="gold" preferPng />
        <p className={styles.tagline}>מה אפשר לעשות בשבילך עכשיו?</p>
      </section>

      <Link href="/intake" className={styles.captureEntry}>
        <span className={styles.captureCamera} aria-hidden>
          <Camera size={22} strokeWidth={2} />
        </span>
        <span className={styles.captureText}>
          <span className={styles.captureTitle}>שתף רכב או בקשת לקוח</span>
          <span className={styles.captureSub}>
            תמונה · WhatsApp · צילום מסך · טקסט
          </span>
        </span>
        <ChevronLeft className={styles.captureChevron} size={18} aria-hidden />
      </Link>

      <div
        className={styles.quickGrid}
        role="navigation"
        aria-label="פעולות ליבה"
      >
        <Link href="/home#composer" className={styles.quickTile}>
          <Search size={22} />
          <span>יש לי לקוח</span>
        </Link>
        <Link href="/intake/handoff" className={styles.quickTile}>
          <Package size={22} />
          <span>יש לי רכב</span>
        </Link>
        <Link href="/intelligence" className={styles.quickTile}>
          <Sparkles size={22} />
          <span>מה ברשת?</span>
        </Link>
        <button
          type="button"
          className={cn(styles.quickTile, styles.quickTileGold)}
          onClick={() => agent?.openAgent()}
        >
          <Sparkles size={22} />
          <span>שאל את REMATCHER</span>
        </button>
      </div>

      {urgentBlockers.length > 0 && (
        <div className={styles.notices} role="status">
          {urgentBlockers.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={styles.notice}
            >
              <Surface depth="raised" className={styles.noticeInner}>
                <span className={styles.noticeLabel}>{item.label}</span>
                {item.count > 1 && (
                  <span className={styles.noticeCount}>{item.count}</span>
                )}
              </Surface>
            </Link>
          ))}
        </div>
      )}

      {attentionCards.length > 0 && (
        <section className={styles.attention} aria-label="מה חדש עבורך">
          <h2 className={styles.sectionTitle}>דורש תשומת לב</h2>
          <div className={styles.attentionRow}>
            {attentionCards.map((c) => (
              <Link
                key={c.href + c.label}
                href={c.href}
                className={cn(styles.attentionCard, styles[`tone_${c.tone}`])}
              >
                <span className={styles.attentionLabel}>{c.label}</span>
                <span className={styles.attentionCount}>{c.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.composer} id="composer" aria-label="חיפוש ברשת">
        <h2 className={styles.sectionTitle}>התחל חיפוש</h2>
        <CreateDemandFlow variant="home" />
      </section>
    </div>
  );
}
