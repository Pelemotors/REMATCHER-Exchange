import styles from "./hero-exchange-visual.module.css";
import { cn } from "@/lib/utils";
import { ExchangeMark } from "@/components/brand/exchange-mark";

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

/** 2–3 signal nodes only — synced to searching phase via CSS */
const SUPPLY_SIGNALS = [
  { x: 18, y: 38 },
  { x: 12, y: 58 },
];

const DEMAND_SIGNALS = [{ x: 82, y: 34 }];

export function HeroExchangeVisual({ className }: { className?: string }) {
  return (
    <div className={cn(styles.stage, className)} aria-hidden>
      <span className={styles.supplyLabel}>SUPPLY</span>
      <span className={styles.demandLabel}>DEMAND</span>

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

        {SUPPLY_SIGNALS.map((n, i) => (
          <g key={`ss-${i}`} className={styles.signalGroup}>
            <line
              x1={n.x}
              y1={n.y}
              x2="50"
              y2="50"
              className={styles.signalPath}
            />
            <circle cx={n.x} cy={n.y} r="1.1" className={styles.activeNode} />
          </g>
        ))}

        {DEMAND_SIGNALS.map((n, i) => (
          <g key={`ds-${i}`} className={styles.signalGroup}>
            <line
              x1={n.x}
              y1={n.y}
              x2="50"
              y2="50"
              className={styles.signalPathDemand}
            />
            <circle
              cx={n.x}
              cy={n.y}
              r="1.1"
              className={styles.activeNodeDemand}
            />
          </g>
        ))}
      </svg>

      <div className={styles.markWrap}>
        <ExchangeMark loop variant="hero" className={styles.mark} />
      </div>

      <span className={styles.matchLabel}>MATCH</span>
    </div>
  );
}
