/** Canonical Privacy & AI / Terms version identifiers (LOCKED v1). */

export const PRIVACY_POLICY_VERSION = "privacy-ai-v1.0-2026-09-05" as const;
export const TERMS_VERSION = "terms-v1.0-2026-09-05" as const;
export const CONSENT_TEXT_VERSION = "consent-copy-v1.0-2026-09-05" as const;

export const PRIVACY_POLICY_DISPLAY = {
  title: "מדיניות פרטיות ו־AI — REMATCHER Exchange",
  versionLabel: "גרסה 1.0",
  updatedAt: "5 בספטמבר 2026",
  controllerName: "גל סממה",
  controllerLocation: "מצפה עדי, ישראל",
  contactEmail: "privacy@rematcher.co.il",
} as const;

export const TERMS_DISPLAY = {
  title: "תנאי שימוש — REMATCHER Exchange",
  versionLabel: "גרסה 1.0",
  updatedAt: "5 בספטמבר 2026",
  controllerName: "גל סממה",
  controllerLocation: "מצפה עדי, ישראל",
  contactEmail: "privacy@rematcher.co.il",
} as const;

export type PrivacyConsentTypeKey =
  | "DEALER_MEMORY"
  | "AGENT_TO_EXCHANGE_LEARNING"
  | "EXCHANGE_ACTIVITY_LEARNING"
  | "EXTERNAL_ACTIVITY_LEARNING";

export const PRIVACY_CONSENT_TYPES: PrivacyConsentTypeKey[] = [
  "DEALER_MEMORY",
  "AGENT_TO_EXCHANGE_LEARNING",
  "EXCHANGE_ACTIVITY_LEARNING",
  "EXTERNAL_ACTIVITY_LEARNING",
];

export const PRIVACY_CONSENT_LABELS_HE: Record<PrivacyConsentTypeKey, string> = {
  DEALER_MEMORY: "זיכרון עסקי אישי",
  AGENT_TO_EXCHANGE_LEARNING: "תרומת הסוכן ללמידת REMATCHER",
  EXCHANGE_ACTIVITY_LEARNING: "למידה מפעילות בבורסה",
  EXTERNAL_ACTIVITY_LEARNING: "למידה מפעילות חיצונית ששיתפת",
};
