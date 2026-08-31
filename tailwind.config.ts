import type { Config } from "tailwindcss";
import { TOKENS } from "./src/config/brand";

const c = TOKENS.color;

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        midnight: c.midnight,
        ink: c.ink,
        signal: {
          DEFAULT: c.signal,
          hover: c.signalHover,
          soft: c.signalSoft,
        },
        canvas: c.canvas,
        surface: {
          DEFAULT: c.surface,
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
