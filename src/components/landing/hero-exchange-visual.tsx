import styles from "./hero-exchange-visual.module.css";
import { cn } from "@/lib/utils";
import { ExchangeMark } from "@/components/brand/exchange-mark";
import type { ExchangeMarkState } from "@/config/brand-v2";

/** Nearly invisible ambient nodes — open space, not a diagram */
const AMBIENT = [
  { x: 14, y: 28, o: 0.06 },
  { x: 22, y: 52, o: 0.04 },
  { x: 10, y: 68, o: 0.05 },
  { x: 86, y: 24, o: 0.05 },
  { x: 90, y: 48, o: 0.04 },
  { x: 84, y: 72, o: 0.06 },
  { x: 32, y: 18, o: 0.03 },
  { x: 68, y: 82, o: 0.03 },
];

const SUPPLY_ACTIVE = [
  { x: 18, y: 38, delay: 0 },
  { x: 12, y: 58, delay: 0.35 },
  { x: 24, y: 68, delay: 0.7 },
];

const DEMAND_ACTIVE = [
  { x: 82, y: 34, delay: 0.15 },
  { x: 88, y: 56, delay: 0.5 },
  { x: 76, y: 66, delay: 0.85 },
];

export function HeroExchangeVisual({
  markState,
  className,
}: {
  markState: ExchangeMarkState;
  className?: string;
}) {
  const signalsActive =
    markState === "searching" || markState === "converging";
  const showMatch = markState === "matched";

  return (
    <div
      className={cn(styles.stage, className)}
      data-mark-state={markState}
      aria-hidden
    >
      <span className={styles.supplyLabel}>SUPPLY</span>
      <span className={styles.demandLabel}>DEMAND</span>

      {/* Atmospheric field — no circles, no graph lines */}
      <svg
        viewBox="0 0 100 100"
        className={styles.field}
        xmlns="http://www.w3.org/2000/svg"
      >
        {AMBIENT.map((n, i) => (
          <circle
            key={`a-${i}`}
            cx={n.x}
            cy={n.y}
            r="0.45"
            fill="#C9CED3"
            opacity={n.o}
          />
        ))}

        {signalsActive &&
          SUPPLY_ACTIVE.map((n, i) => (
            <line
              key={`ss-${i}`}
              x1={n.x}
              y1={n.y}
              x2="50"
              y2="50"
              className={styles.signalPath}
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
              style={{ animationDelay: `${n.delay + 0.12}s` }}
            />
          ))}

        {signalsActive &&
          SUPPLY_ACTIVE.map((n, i) => (
            <circle
              key={`sn-${i}`}
              cx={n.x}
              cy={n.y}
              r="1.1"
              className={styles.activeNode}
              style={{ animationDelay: `${n.delay}s` }}
            />
          ))}
        {signalsActive &&
          DEMAND_ACTIVE.map((n, i) => (
            <circle
              key={`dn-${i}`}
              cx={n.x}
              cy={n.y}
              r="1.1"
              className={styles.activeNodeDemand}
              style={{ animationDelay: `${n.delay}s` }}
            />
          ))}
      </svg>

      {/* Dominant Exchange mark — transparent, no container */}
      <div className={styles.markWrap}>
        <ExchangeMark state={markState} variant="hero" className={styles.mark} />
      </div>

      {showMatch && <span className={styles.matchLabel}>MATCH</span>}
    </div>
  );
}
