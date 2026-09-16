"use client";

import { BrandMark } from "@/components/brand/brand-mark";
import styles from "./agent-orb.module.css";

export function AgentOrb({
  size = 112,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const mark = Math.round(size * 0.42);
  return (
    <div
      className={`${styles.orb} ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className={styles.glow} />
      <span className={styles.ring} />
      <span className={styles.face}>
        <BrandMark variant="gold" size={mark} />
      </span>
    </div>
  );
}

export function AgentAvatar({ size = 28 }: { size?: number }) {
  return <AgentOrb size={size} className={styles.avatar} />;
}
