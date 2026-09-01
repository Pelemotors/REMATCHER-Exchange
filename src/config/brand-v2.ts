/**
 * REMATCHER Exchange — Brand System v2 (Proof rollout)
 * Scoped via [data-brand-ui="2"] — does not replace v1 globally.
 */

export const BRAND_UI_VERSION = 2 as const;

export const TOKENS_V2 = {
  color: {
    midnight: "#070C14",
    graphite: "#111A26",
    deepNavy: "#163A5F",
    exchangeBlue: "#174A73",
    signalBlue: "#2D78A8",
    signalBlueSoft: "rgba(45, 120, 168, 0.12)",
    platinum: "#C9CED3",
    warmWhite: "#F3F1EC",
    canvas: "#0A1018",
    surface: "#111A26",
    surfaceRaised: "#162030",
    surfaceSecondary: "#1A2535",
    border: "rgba(201, 206, 211, 0.12)",
    borderStrong: "rgba(201, 206, 211, 0.22)",
    textPrimary: "#F3F1EC",
    textSecondary: "rgba(243, 241, 236, 0.72)",
    textMuted: "rgba(243, 241, 236, 0.48)",
    disabled: "rgba(201, 206, 211, 0.35)",
    success: "#16865C",
    successSoft: "rgba(22, 134, 92, 0.15)",
    warning: "#C47A12",
    warningSoft: "rgba(196, 122, 18, 0.15)",
    error: "#C53B3B",
    errorSoft: "rgba(197, 59, 59, 0.15)",
    info: "#2D78A8",
    infoSoft: "rgba(45, 120, 168, 0.12)",
  },
  typography: {
    display: { size: "2.5rem", lineHeight: "1.15", weight: 700 },
    title: { size: "1.75rem", lineHeight: "1.25", weight: 600 },
    section: { size: "1.125rem", lineHeight: "1.4", weight: 600 },
    body: { size: "0.9375rem", lineHeight: "1.55", weight: 400 },
    label: { size: "0.75rem", lineHeight: "1.3", weight: 600 },
    data: { size: "1.75rem", lineHeight: "1.1", weight: 600 },
    dataSm: { size: "1.25rem", lineHeight: "1.2", weight: 600 },
  },
  motion: {
    fast: "150ms",
    normal: "250ms",
    converge: "400ms",
    matchPulse: "300ms",
    searchLoop: "2s",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
  },
  shadow: {
    surface: "0 1px 0 rgba(201, 206, 211, 0.06) inset",
    elevated: "0 8px 32px rgba(0, 0, 0, 0.35)",
    signal: "0 0 24px rgba(45, 120, 168, 0.25)",
  },
} as const;

export const CSS_VARS_V2 = {
  midnight: "--rm2-midnight",
  graphite: "--rm2-graphite",
  deepNavy: "--rm2-deep-navy",
  exchangeBlue: "--rm2-exchange-blue",
  signalBlue: "--rm2-signal-blue",
  signalBlueSoft: "--rm2-signal-blue-soft",
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
  exchangeMark: "/brand/rematcher-exchange-mark-v1.svg",
  appIcon: "/icons/icon.svg",
} as const;

export type ExchangeMarkState =
  | "idle"
  | "searching"
  | "converging"
  | "matched";
