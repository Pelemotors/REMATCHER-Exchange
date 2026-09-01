import styles from "./network-visualization.module.css";
import { cn } from "@/lib/utils";

/** Deterministic pseudo-random for stable node field */
function fieldDot(index: number, side: "supply" | "demand") {
  const seed = side === "supply" ? 17 : 53;
  const t = (index * seed * 1.618) % 1;
  const u = (index * seed * 2.399) % 1;
  const x = side === "supply" ? 8 + t * 34 : 58 + t * 34;
  const y = 12 + u * 76;
  const r = 0.35 + u * 0.55;
  const opacity = 0.08 + t * 0.22;
  return { x, y, r, opacity };
}

const SUPPLY_ACTIVE = [
  { x: 18, y: 32, delay: 0 },
  { x: 12, y: 58, delay: 0.4 },
  { x: 24, y: 72, delay: 0.8 },
];

const DEMAND_ACTIVE = [
  { x: 82, y: 28, delay: 0.2 },
  { x: 88, y: 54, delay: 0.6 },
  { x: 76, y: 70, delay: 1 },
];

/**
 * Hero network stage — atmospheric node field with signal paths toward center mark.
 * Not a technical node graph.
 */
export function HeroNetworkStage({
  markState,
  children,
  className,
}: {
  markState: "idle" | "searching" | "converging" | "matched";
  children: React.ReactNode;
  className?: string;
}) {
  const fieldDots = Array.from({ length: 56 }, (_, i) => ({
    supply: fieldDot(i, "supply"),
    demand: fieldDot(i + 7, "demand"),
  }));

  const signalsActive = markState === "searching" || markState === "converging";

  return (
    <div
      className={cn(styles.stage, className)}
      aria-hidden
      data-mark-state={markState}
    >
      <div className={styles.atmosphere} />
      <div className={styles.ringOuter} />
      <div className={styles.ringInner} />

      <svg
        viewBox="0 0 100 100"
        className={styles.field}
        xmlns="http://www.w3.org/2000/svg"
      >
        {fieldDots.map((d, i) => (
          <g key={i}>
            <circle
              cx={d.supply.x}
              cy={d.supply.y}
              r={d.supply.r}
              fill="#C9CED3"
              opacity={d.supply.opacity}
            />
            <circle
              cx={d.demand.x}
              cy={d.demand.y}
              r={d.demand.r}
              fill="#C9CED3"
              opacity={d.demand.opacity}
            />
          </g>
        ))}

        {signalsActive &&
          SUPPLY_ACTIVE.map((n, i) => (
            <line
              key={`ss-${i}`}
              x1={n.x}
              y1={n.y}
              x2="50"
              y2="50"
              className={styles.signalPathSupply}
              style={{ animationDelay: `${n.delay}s` }}
            />
          ))}
        {signalsActive &&
          DEMAND_ACTIVE.map((n, i) => (
            <line
              key={`ds-${i}`}
              x1={n.x}
              y1={n.y}
              x2="50"
              y2="50"
              className={styles.signalPathDemand}
              style={{ animationDelay: `${n.delay + 0.15}s` }}
            />
          ))}

        {SUPPLY_ACTIVE.map((n, i) => (
          <g key={`sa-${i}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r="2.8"
              className={cn(
                styles.activeNodeSupply,
                signalsActive && styles.activeNodePulse
              )}
              style={{ animationDelay: `${n.delay}s` }}
            />
            <circle cx={n.x} cy={n.y} r="1.2" fill="#4A9FD4" opacity="0.9" />
          </g>
        ))}
        {DEMAND_ACTIVE.map((n, i) => (
          <g key={`da-${i}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r="2.8"
              className={cn(
                styles.activeNodeDemand,
                signalsActive && styles.activeNodePulse
              )}
              style={{ animationDelay: `${n.delay}s` }}
            />
            <circle cx={n.x} cy={n.y} r="1.2" fill="#E8EBEE" opacity="0.95" />
          </g>
        ))}
      </svg>

      <div className={styles.labelSupply}>SUPPLY</div>
      <div className={styles.labelDemand}>DEMAND</div>

      <div className={styles.markWrap}>{children}</div>
    </div>
  );
}
