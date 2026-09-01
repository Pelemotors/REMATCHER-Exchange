import { useId } from "react";
import styles from "./exchange-mark.module.css";
import { cn } from "@/lib/utils";
import type { ExchangeMarkState } from "@/config/brand-v2";

export interface ExchangeMarkProps {
  state?: ExchangeMarkState;
  size?: number;
  variant?: "full" | "hero";
  className?: string;
  decorative?: boolean;
  label?: string;
}

const VIEW_FULL = { w: 1200, h: 800 };
/** Crop empty margins — paths unchanged, display only */
const VIEW_HERO = { w: 760, h: 600, x: 220, y: 100 };

/**
 * Approved Exchange mark — geometry from public/brand/rematcher-exchange-mark-v1.svg
 * Animates only transform/opacity on: left-half, right-half, connection-diamond
 */
export function ExchangeMark({
  state = "idle",
  size = 480,
  variant = "full",
  className,
  decorative = true,
  label = "Exchange",
}: ExchangeMarkProps) {
  const uid = useId().replace(/:/g, "");
  const view =
    variant === "hero"
      ? VIEW_HERO
      : { ...VIEW_FULL, x: 0, y: 0 };
  const height = Math.round(size * (view.h / view.w));

  const ids = {
    blueFace: `blueFace-${uid}`,
    blueEdge: `blueEdge-${uid}`,
    platinumFace: `platinumFace-${uid}`,
    platinumEdge: `platinumEdge-${uid}`,
    diamondFace: `diamondFace-${uid}`,
    softShadow: `softShadow-${uid}`,
    diamondGlow: `diamondGlow-${uid}`,
  };

  return (
    <svg
      width={variant === "hero" ? undefined : size}
      height={variant === "hero" ? undefined : height}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(styles.mark, styles[state], className)}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative}
      aria-label={decorative ? undefined : label}
    >
      <defs>
        <linearGradient id={ids.blueFace} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2D78A8" />
          <stop offset="42%" stopColor="#174A73" />
          <stop offset="100%" stopColor="#0D2740" />
        </linearGradient>
        <linearGradient id={ids.blueEdge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6DBBEE" />
          <stop offset="100%" stopColor="#174A73" />
        </linearGradient>
        <linearGradient id={ids.platinumFace} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3F1EC" />
          <stop offset="38%" stopColor="#C9CED3" />
          <stop offset="100%" stopColor="#747D87" />
        </linearGradient>
        <linearGradient id={ids.platinumEdge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#8C949C" />
        </linearGradient>
        <linearGradient id={ids.diamondFace} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#72C8FF" />
          <stop offset="50%" stopColor="#2D78A8" />
          <stop offset="100%" stopColor="#174A73" />
        </linearGradient>
        <filter
          id={ids.softShadow}
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
        >
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="18"
            floodColor="#000814"
            floodOpacity="0.5"
          />
        </filter>
        <filter
          id={ids.diamondGlow}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feFlood floodColor="#2D78A8" floodOpacity="0.5" result="flood" />
          <feComposite in="flood" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(600 400)">
        <g
          id="left-half"
          className={styles.leftHalf}
          filter={`url(#${ids.softShadow})`}
        >
          <path
            d="M -330 -250
               L -180 -250
               L -30 -95
               L -92 -28
               L -215 -155
               L -330 -155
               Z

               M -330 250
               L -180 250
               L -30 95
               L -92 28
               L -215 155
               L -330 155
               Z"
            fill={`url(#${ids.blueFace})`}
            fillRule="evenodd"
          />
          <path
            d="M -330 -250
               L -180 -250
               L -30 -95
               M -330 250
               L -180 250
               L -30 95"
            fill="none"
            stroke={`url(#${ids.blueEdge})`}
            strokeWidth="8"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <path
            d="M -30 -95 L -92 -28
               M -30 95 L -92 28"
            fill="none"
            stroke="#4D9DCE"
            strokeOpacity="0.85"
            strokeWidth="5"
          />
        </g>

        <g
          id="right-half"
          className={styles.rightHalf}
          filter={`url(#${ids.softShadow})`}
        >
          <path
            d="M 330 -250
               L 180 -250
               L 30 -95
               L 92 -28
               L 215 -155
               L 330 -155
               Z

               M 330 250
               L 180 250
               L 30 95
               L 92 28
               L 215 155
               L 330 155
               Z"
            fill={`url(#${ids.platinumFace})`}
            fillRule="evenodd"
          />
          <path
            d="M 330 -250
               L 180 -250
               L 30 -95
               M 330 250
               L 180 250
               L 30 95"
            fill="none"
            stroke={`url(#${ids.platinumEdge})`}
            strokeWidth="8"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <path
            d="M 30 -95 L 92 -28
               M 30 95 L 92 28"
            fill="none"
            stroke="#F7F8FA"
            strokeOpacity="0.75"
            strokeWidth="5"
          />
        </g>

        <g
          id="connection-diamond"
          className={styles.connectionDiamond}
          filter={`url(#${ids.diamondGlow})`}
        >
          <rect
            x="-36"
            y="-36"
            width="72"
            height="72"
            rx="2"
            transform="rotate(45)"
            fill={`url(#${ids.diamondFace})`}
            stroke="#D7F0FF"
            strokeWidth="5"
          />
          <rect
            x="-22"
            y="-22"
            width="44"
            height="44"
            rx="1"
            transform="rotate(45)"
            fill="#60BFFF"
            fillOpacity="0.24"
          />
        </g>
      </g>
    </svg>
  );
}
