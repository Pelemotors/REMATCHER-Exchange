/**
 * REMATCHER Exchange — Brand System v2.1 (Dark Premium Visual SoT)
 * Gold = brand emphasis · Exchange Blue = interaction · Green = success only
 */

export const BRAND_UI_VERSION = 2 as const;

export const TOKENS_V2 = {
  color: {
    /** Visual SoT — Midnight base */
    midnight: "#0B1114",
    graphite: "#1F2937",
    deepNavy: "#121A22",
    slate: "#1F2937",
    /** Interaction / processing */
    exchangeBlue: "#2E68F7",
    signalBlue: "#2E68F7",
    signalBlueSoft: "rgba(46, 104, 247, 0.14)",
    /** Brand primary emphasis */
    gold: "#D4AF3B",
    goldSoft: "rgba(212, 175, 59, 0.16)",
    goldStrong: "#B8922E",
    /** Text */
    platinum: "#EBEDEF",
    warmWhite: "#EBEDEF",
    canvas: "#0B1114",
    surface: "#121A22",
    surfaceRaised: "#1A2330",
    surfaceSecondary: "#1F2937",
    border: "rgba(235, 237, 239, 0.10)",
    borderStrong: "rgba(235, 237, 239, 0.20)",
    textPrimary: "#EBEDEF",
    textSecondary: "rgba(235, 237, 239, 0.72)",
    textMuted: "rgba(235, 237, 239, 0.48)",
    disabled: "rgba(235, 237, 239, 0.32)",
    /** Semantic only */
    success: "#22A06B",
    successSoft: "rgba(34, 160, 107, 0.16)",
    warning: "#E08A1E",
    warningSoft: "rgba(224, 138, 30, 0.16)",
    error: "#E24B4B",
    errorSoft: "rgba(226, 75, 75, 0.16)",
    info: "#2E68F7",
    infoSoft: "rgba(46, 104, 247, 0.14)",
    opportunity: "#E08A1E",
    opportunitySoft: "rgba(224, 138, 30, 0.16)",
  },
  typography: {
    display: { size: "2rem", lineHeight: "1.15", weight: 700 },
    hero: { size: "1.75rem", lineHeight: "1.15", weight: 700 },
    title: { size: "1.5rem", lineHeight: "1.25", weight: 700 },
    section: { size: "1.125rem", lineHeight: "1.35", weight: 700 },
    body: { size: "1rem", lineHeight: "1.5", weight: 400 },
    secondary: { size: "0.875rem", lineHeight: "1.45", weight: 400 },
    label: { size: "0.75rem", lineHeight: "1.3", weight: 600 },
    caption: { size: "0.75rem", lineHeight: "1.35", weight: 400 },
    micro: { size: "0.6875rem", lineHeight: "1.3", weight: 500 },
    data: { size: "1.5rem", lineHeight: "1.1", weight: 700 },
    dataSm: { size: "1.125rem", lineHeight: "1.2", weight: 600 },
  },
  spacing: {
    scale: [4, 8, 12, 16, 20, 24, 32, 40, 48] as const,
    pagePadX: "16px",
    touchMin: "44px",
    ctaHeight: "52px",
    inputHeight: "48px",
    rowMin: "72px",
    bottomNavHeight: "64px",
  },
  motion: {
    fast: "150ms",
    normal: "220ms",
    converge: "360ms",
    matchPulse: "280ms",
    searchLoop: "2s",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    pill: "999px",
  },
  shadow: {
    surface: "0 1px 0 rgba(235, 237, 239, 0.04) inset",
    elevated: "0 10px 28px rgba(0, 0, 0, 0.40)",
    signal: "0 0 20px rgba(46, 104, 247, 0.22)",
    gold: "0 0 18px rgba(212, 175, 59, 0.18)",
  },
} as const;

export const CSS_VARS_V2 = {
  midnight: "--rm2-midnight",
  graphite: "--rm2-graphite",
  deepNavy: "--rm2-deep-navy",
  exchangeBlue: "--rm2-exchange-blue",
  signalBlue: "--rm2-signal-blue",
  signalBlueSoft: "--rm2-signal-blue-soft",
  gold: "--rm2-gold",
  goldSoft: "--rm2-gold-soft",
  platinum: "--rm2-platinum",
  warmWhite: "--rm2-warm-white",
  canvas: "--rm2-canvas",
  surface: "--rm2-surface",
  surfaceRaised: "--rm2-surface-raised",
  surfaceSecondary: "--rm2-surface-secondary",
  border: "--rm2-border",
  borderStrong: "--rm2-border-strong",
  textPrimary: "--rm2-text-primary",
  textSecondary: "--rm2-text-secondary",
  textMuted: "--rm2-text-muted",
  success: "--rm2-success",
  warning: "--rm2-warning",
  error: "--rm2-error",
} as const;

export const BRAND_ASSETS_V2 = {
  /** Primary brand mark — Gold R (SVG) */
  rMarkGold: "/brand/rematcher-r-gold.svg",
  rMarkWhite: "/brand/rematcher-r-white.svg",
  rMarkBlue: "/brand/rematcher-r-blue.svg",
  rMarkDark: "/brand/rematcher-r-dark.svg",
  /** Raster masters (owner assets) — fallback / high-fidelity */
  rMarkGoldPng: "/brand/rematcher-r-gold.png",
  lockupDark: "/brand/rematcher-lockup-dark.png",
  /** Legacy Exchange network mark — processing/history only */
  exchangeMarkLegacy: "/brand/rematcher-exchange-mark-v1.svg",
  exchangeMark: "/brand/rematcher-r-gold.svg",
  appIcon: "/icons/icon.svg",
} as const;

export type ExchangeMarkState =
  | "idle"
  | "searching"
  | "converging"
  | "matched";

export type BrandMarkVariant = "gold" | "white" | "blue" | "dark";
