import type { Config } from "tailwindcss";
import { TOKENS, TOKENS_V2 } from "./src/config/brand";

/** Product UI uses Brand v2 palette globally; v1 TOKENS kept for legacy references only */
const c = TOKENS_V2.color;
const v2 = TOKENS_V2.color;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        midnight: c.midnight,
        ink: c.warmWhite,
        signal: {
          DEFAULT: c.signalBlue,
          hover: c.exchangeBlue,
          soft: c.signalBlueSoft,
        },
        canvas: c.canvas,
        surface: {
          DEFAULT: c.surfaceRaised,
          secondary: c.surfaceSecondary,
        },
        border: {
          DEFAULT: c.border,
          strong: c.borderStrong,
        },
        "text-primary": c.textPrimary,
        "text-secondary": c.textSecondary,
        "text-muted": c.textMuted,
        disabled: c.disabled,
        success: { DEFAULT: c.success, soft: c.successSoft },
        warning: { DEFAULT: c.warning, soft: c.warningSoft },
        error: { DEFAULT: c.error, soft: c.errorSoft },
        info: { DEFAULT: c.info, soft: c.infoSoft },
        /* Brand UI v2 — use inside [data-brand-ui="2"] */
        "v2-midnight": v2.midnight,
        "v2-graphite": v2.graphite,
        "v2-deep-navy": v2.deepNavy,
        "v2-exchange": v2.exchangeBlue,
        "v2-signal": {
          DEFAULT: v2.signalBlue,
          soft: v2.signalBlueSoft,
        },
        "v2-platinum": v2.platinum,
        "v2-warm": v2.warmWhite,
        "v2-canvas": v2.canvas,
        "v2-surface": {
          DEFAULT: v2.surface,
          raised: v2.surfaceRaised,
          secondary: v2.surfaceSecondary,
        },
        "v2-border": {
          DEFAULT: v2.border,
          strong: v2.borderStrong,
        },
        "v2-text": {
          primary: v2.textPrimary,
          secondary: v2.textSecondary,
          muted: v2.textMuted,
        },
      },
      fontFamily: {
        sans: ["var(--font-heebo)", "Heebo", "Arial", "sans-serif"],
      },
      fontSize: {
        display: [
          TOKENS.typography.display.size,
          { lineHeight: TOKENS.typography.display.lineHeight },
        ],
        h1: [
          TOKENS.typography.h1.size,
          { lineHeight: TOKENS.typography.h1.lineHeight },
        ],
        h2: [
          TOKENS.typography.h2.size,
          { lineHeight: TOKENS.typography.h2.lineHeight },
        ],
        h3: [
          TOKENS.typography.h3.size,
          { lineHeight: TOKENS.typography.h3.lineHeight },
        ],
        body: [
          TOKENS.typography.body.size,
          { lineHeight: TOKENS.typography.body.lineHeight },
        ],
        small: [
          TOKENS.typography.small.size,
          { lineHeight: TOKENS.typography.small.lineHeight },
        ],
        label: [
          TOKENS.typography.label.size,
          { lineHeight: TOKENS.typography.label.lineHeight },
        ],
        section: [
          TOKENS_V2.typography.section.size,
          { lineHeight: TOKENS_V2.typography.section.lineHeight },
        ],
        title: [
          TOKENS_V2.typography.title.size,
          { lineHeight: TOKENS_V2.typography.title.lineHeight },
        ],
        "body-lg": [
          TOKENS.typography.bodyLg.size,
          { lineHeight: TOKENS.typography.bodyLg.lineHeight },
        ],
      },
      spacing: {
        "rm-1": TOKENS.spacing[1],
        "rm-2": TOKENS.spacing[2],
        "rm-3": TOKENS.spacing[3],
        "rm-4": TOKENS.spacing[4],
        "rm-5": TOKENS.spacing[5],
        "rm-6": TOKENS.spacing[6],
        "rm-8": TOKENS.spacing[8],
      },
      borderRadius: {
        sm: TOKENS.radius.sm,
        md: TOKENS.radius.md,
        lg: TOKENS.radius.lg,
        xl: TOKENS.radius.xl,
      },
      boxShadow: {
        card: TOKENS.shadow.card,
        elevated: TOKENS.shadow.elevated,
        modal: TOKENS.shadow.modal,
      },
      minHeight: {
        touch: TOKENS.touchTarget.desktop,
        "touch-mobile": TOKENS.touchTarget.mobile,
      },
      maxWidth: {
        content: TOKENS.contentMaxWidth,
      },
      transitionDuration: {
        fast: TOKENS.motion.fast,
        normal: TOKENS.motion.normal,
        reveal: TOKENS.motion.reveal,
      },
    },
  },
  plugins: [],
};

export default config;
