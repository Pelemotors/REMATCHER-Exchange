/**
 * Marketing landing — Dark Premium automotive SoT.
 * Photography paths are swappable; CSS atmosphere is the fallback.
 */
export const LANDING_ASSETS = {
  heroShowroom: "/brand/landing/hero-showroom.webp",
  heroShowroomFallback: "/brand/landing/hero-showroom.png",
  ctaHeadlights: "/brand/landing/cta-headlights.webp",
  ctaHeadlightsFallback: "/brand/landing/cta-headlights.png",
} as const;

export const LANDING_COPY = {
  nav: [
    { href: "#why", label: "למה REMATCHER" },
    { href: "#how", label: "איך זה עובד" },
    { href: "#capabilities", label: "יכולות" },
    { href: "#faq", label: "שאלות נפוצות" },
  ],
  hero: {
    h1Line1: "אל תחפש ברשת.",
    h1Line2Before: "תן ל־",
    h1Gold: "REMATCHER",
    h1Line2After: " לחפש בשבילך.",
    support:
      "רשת פרטית לסוחרי רכב שמחברת בין מה שהלקוחות שלך מחפשים לבין רכבים שנמצאים אצל סוחרים אחרים — בלי לחשוף את הצדדים עד ששניכם רוצים להתקדם.",
    primaryCta: "הצטרף ל־REMATCHER",
    secondaryCta: "ראה איך זה עובד",
    trust: [
      "רשת סוחרים פרטית",
      "התאמות אנונימיות",
      "פחות חיפוש ידני",
    ],
  },
} as const;
