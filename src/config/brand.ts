/**
 * REMATCHER Exchange — Brand System v1 (LOCKED)
 * Single source of truth for design tokens.
 * Do not invent colors/fonts/radius/shadows outside this file.
 */

export const BRAND = {
  parent: "REMATCHER",
  product: "REMATCHER Exchange",
  productShort: "Exchange",
  tagline: "המלאי שלך פוגש את הביקוש של הרשת",
  brandIdea: "למצוא את החיבור שכבר נמצא שם.",
  pushSender: "REMATCHER Exchange",
} as const;

export const COPY = {
  demand: "חיפוש",
  match: "התאמה",
  matchStrong: "התאמה גבוהה",
  matchPossible: "התאמה אפשרית",
  matchWithGap: "התאמה טובה עם פער",
  interested: "מעניין אותי",
  notRelevant: "לא רלוונטי",
  opportunity: "יש עניין ברכב שלך",
  mutualInterest: "יש עניין הדדי",
  reveal: "נוצר חיבור",
  revealHeadline: "יש חיבור",
  revealSub: "שני הצדדים הביעו עניין. עכשיו אפשר לדבר.",
  outcome: "מה קרה עם החיבור?",
  outcomeBillingNote:
    "הדיווח לא משפיע על החיוב ועוזר ל-REMATCHER Exchange לשפר את ההתאמות הבאות.",
  validationAvailability: "הרכב עדיין זמין?",
  validationB2bPrice: "באיזה מחיר תהיה מוכן להציע אותו לסוחר?",
  validationContext: "יש ביקוש רלוונטי לרכב שלך",
  verifiedDealer: "סוחר מאומת",
  privacyNote: "הפרטים ייחשפו לאחר עניין הדדי.",
  interestNonBinding:
    "מעוניין = בקשה להיחשף לצד השני במקרה של עניין הדדי. לא התחייבות לעסקה.",
  connectionsRemaining: (used: number, total: number) =>
    total <= 5
      ? `נשארו לך ${total - used} מתוך ${total} החיבורים הראשונים ללא עלות`
      : `${used} מתוך ${total} חיבורים החודש`,
  commercialActionRequired:
    "נדרשת פעולה מסחרית — פנו אלינו להמשך שימוש בחיבורים חדשים.",
  emptyMatches: {
    title: "עדיין אין התאמה",
    description:
      "REMATCHER ממשיך לבדוק את המלאי ברשת מול החיפוש שלך.",
  },
  emptyOpportunities: {
    title: "אין כרגע עניין שמחכה לתגובה",
    description: "כשסוחר אחר יתעניין ברכב שלך, זה יופיע כאן.",
  },
} as const;

/** LOCKED design tokens — map to CSS vars & Tailwind */
export const TOKENS = {
  color: {
    midnight: "#0B1220",
    ink: "#111827",
    signal: "#18C37E",
    signalHover: "#12A96D",
    signalSoft: "#E8F8F1",
    canvas: "#F6F8FA",
    surface: "#FFFFFF",
    surfaceSecondary: "#F1F4F7",
    border: "#E2E7EC",
    borderStrong: "#CDD5DE",
    textPrimary: "#111827",
    textSecondary: "#5F6B7A",
    textMuted: "#8B96A5",
    disabled: "#B8C0CA",
    success: "#16865C",
    successSoft: "#E8F5EF",
    warning: "#C47A12",
    warningSoft: "#FFF5E5",
    error: "#C53B3B",
    errorSoft: "#FDECEC",
    info: "#3478C9",
    infoSoft: "#EAF2FC",
  },
  spacing: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "20px",
    6: "24px",
    8: "32px",
    10: "40px",
    12: "48px",
    16: "64px",
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
  },
  shadow: {
    card: "0 1px 3px rgba(11,18,32,0.08)",
    elevated: "0 8px 24px rgba(11,18,32,0.10)",
    modal: "0 16px 48px rgba(11,18,32,0.16)",
  },
  typography: {
    display: { size: "32px", lineHeight: "40px", weight: 700 },
    h1: { size: "28px", lineHeight: "36px", weight: 700 },
    h2: { size: "22px", lineHeight: "30px", weight: 700 },
    h3: { size: "18px", lineHeight: "26px", weight: 600 },
    bodyLg: { size: "17px", lineHeight: "26px", weight: 400 },
    body: { size: "15px", lineHeight: "23px", weight: 400 },
    small: { size: "13px", lineHeight: "19px", weight: 400 },
    label: { size: "12px", lineHeight: "16px", weight: 600 },
  },
  touchTarget: {
    desktop: "44px",
    mobile: "48px",
  },
  motion: {
    fast: "150ms",
    normal: "200ms",
    reveal: "350ms",
  },
  contentMaxWidth: "1280px",
} as const;

/** CSS variable names for globals.css */
export const CSS_VARS = {
  midnight: "--rm-midnight",
  ink: "--rm-ink",
  signal: "--rm-signal",
  signalHover: "--rm-signal-hover",
  signalSoft: "--rm-signal-soft",
  canvas: "--rm-canvas",
  surface: "--rm-surface",
  surfaceSecondary: "--rm-surface-secondary",
  border: "--rm-border",
  borderStrong: "--rm-border-strong",
  textPrimary: "--rm-text-primary",
  textSecondary: "--rm-text-secondary",
  textMuted: "--rm-text-muted",
  success: "--rm-success",
  warning: "--rm-warning",
  error: "--rm-error",
  info: "--rm-info",
} as const;

export const STATE_LABELS = {
  activeDemand: "חיפוש פעיל",
  match: "התאמה",
  validation: "נדרש אימות",
  interest: "יש עניין",
  mutual: "עניין הדדי",
  connection: "חיבור",
  completed: "הסתיים",
} as const;

/** Temporary assets — not final logo */
export const BRAND_ASSET_TEMPORARY = {
  appIcon: "/icons/icon.svg",
  wordmarkOnly: true,
} as const;

/** Brand UI v2 — scoped rollout (see brand-v2.ts, docs/BRAND_SYSTEM.md) */
export {
  BRAND_UI_VERSION,
  TOKENS_V2,
  CSS_VARS_V2,
  BRAND_ASSETS_V2,
  type ExchangeMarkState,
} from "./brand-v2";
