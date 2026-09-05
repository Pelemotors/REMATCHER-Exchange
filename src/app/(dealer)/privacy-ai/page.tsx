"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ButtonV2, PageHeaderV2, Surface } from "@/components/ui/brand-v2";
import {
  PRIVACY_CONSENT_LABELS_HE,
  PRIVACY_CONSENT_TYPES,
  type PrivacyConsentTypeKey,
} from "@/config/legal/versions";

type Choice = boolean | null;
type Choices = Record<PrivacyConsentTypeKey, Choice>;
type ConsentState = Record<PrivacyConsentTypeKey, boolean>;

type Step =
  | "intro"
  | "DEALER_MEMORY"
  | "AGENT_TO_EXCHANGE_LEARNING"
  | "EXCHANGE_ACTIVITY_LEARNING"
  | "EXTERNAL_ACTIVITY_LEARNING"
  | "summary";

const CONSENT_SCREENS: {
  key: PrivacyConsentTypeKey;
  title: string;
  paragraphs: string[];
  helper?: string;
}[] = [
  {
    key: "DEALER_MEMORY",
    title: "הסוכן האישי שלך יכול ללמוד להכיר אותך ואת העסק שלך",
    paragraphs: [
      "ככל שהסוכן מכיר טוב יותר את דרך העבודה שלך, הוא יכול לתת לך סיוע והמלצות שמתאימים יותר לעסק שלך.",
      "אם תאשר, הוא יוכל לזכור לאורך זמן העדפות, מטרות, שיקולים עסקיים ומידע רלוונטי שאתה משתף איתו.",
      "הזיכרון הזה אישי לעסק שלך ואינו נחשף לסוחרים אחרים.",
    ],
    helper: "אפשר לשנות את הבחירה בכל עת בהגדרות פרטיות ו־AI.",
  },
  {
    key: "AGENT_TO_EXCHANGE_LEARNING",
    title: "הסוכן האישי שלך יכול לתרום ללמידה של REMATCHER",
    paragraphs: [
      "אם תאשר, הסוכן האישי יוכל להעביר ל־REMATCHER מידע עסקי מובנה על אירועים רלוונטיים שהוא מבין מתוך העבודה איתך — למשל שרכב נמכר, שהתאמה התקדמה או לא התקדמה והסיבה לכך.",
      "המידע יכול להיות מקושר לעסק שלך כאשר הקישור נדרש כדי ללמוד מה עובד עבורך ולשפר התאמות עתידיות.",
      "לא יועברו למוח הבורסה תוכן השיחה עם הסוכן, הזיכרון העסקי האישי שלך, מחיר רצפה, מחיר סגירה, פרטי משא ומתן, מידע אישי על לקוחות או מידע פרטי שאינו נדרש למטרה זו.",
    ],
    helper: "הסוכן האישי יכול להמשיך לעזור לך גם אם לא תאשר.",
  },
  {
    key: "EXCHANGE_ACTIVITY_LEARNING",
    title: "REMATCHER יכולה ללמוד ממה שקורה בהתאמות בבורסה",
    paragraphs: [
      "אם תאשר, REMATCHER תוכל ללמוד מהאופן שבו הפעילות שלך בבורסה מתפתחת בפועל — למשל אילו התאמות עוררו עניין, הגיעו לעניין הדדי, נחשפו, הסתיימו בעסקה או לא התקדמו.",
      "הלמידה יכולה להתייחס גם לעסק שלך ולדפוסי פעילות בין משתמשים, כאשר הדבר מסייע לזהות חיבורים טובים יותר בעתיד.",
      "זהות הצדדים לא תיחשף בניגוד לכללי האנונימיות וה־Reveal.",
      "REMATCHER אינה משתמשת בלמידה זו כדי ללמוד את מחיר הסגירה, מחיר הרצפה, כוח המיקוח או הלחץ המסחרי שלך.",
      "מטרת הלמידה היא לשפר את הסיכוי ליצירת התאמות שמתפתחות לעסקאות — לא להשפיע על המחיר שבו הן נסגרות.",
    ],
  },
  {
    key: "EXTERNAL_ACTIVITY_LEARNING",
    title: "הסוכן יכול ללמוד גם מהפעילות העסקית שאתה בוחר לשתף איתו",
    paragraphs: [
      "אם תבחר לספר לסוכן על רכבים שמכרת או רכשת, עסקאות שביצעת או הזדמנויות שלא התקדמו גם מחוץ ל־REMATCHER, המידע יכול לעזור לו להבין טוב יותר את העסק שלך.",
      "אם תאשר, ניתן יהיה להשתמש גם באירועים עסקיים רלוונטיים מתוך מידע זה כדי לשפר את יכולת המערכת לבצע עבורך התאמות בעלות סיכוי גבוה יותר להתפתח לעסקה.",
      "לא יועברו למוח הבורסה תוכן השיחה, מחיר העסקה, מחירים פרטיים שלא נועדו לשיתוף, פרטי משא ומתן, זהות הצד השני לעסקה או מידע אישי על לקוחות.",
    ],
  },
];

const INITIAL: Choices = {
  DEALER_MEMORY: null,
  AGENT_TO_EXCHANGE_LEARNING: null,
  EXCHANGE_ACTIVITY_LEARNING: null,
  EXTERNAL_ACTIVITY_LEARNING: null,
};

function choiceLabel(value: Choice) {
  if (value === true) return "מאשר";
  if (value === false) return "לא מאשר";
  return "לא נבחר";
}

export default function PrivacyAiOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [choices, setChoices] = useState<Choices>(INITIAL);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consentIndex = useMemo(
    () => CONSENT_SCREENS.findIndex((s) => s.key === step),
    [step]
  );

  function goNextFromConsent(key: PrivacyConsentTypeKey) {
    const idx = CONSENT_SCREENS.findIndex((s) => s.key === key);
    if (idx < 0 || choices[key] === null) return;
    if (idx === CONSENT_SCREENS.length - 1) setStep("summary");
    else setStep(CONSENT_SCREENS[idx + 1].key);
  }

  async function complete() {
    if (!legalAccepted) return;
    if (PRIVACY_CONSENT_TYPES.some((k) => typeof choices[k] !== "boolean")) {
      setError("יש לבחור בכל ההרשאות לפני המשך");
      return;
    }
    setSubmitting(true);
    setError(null);
    const consents = Object.fromEntries(
      PRIVACY_CONSENT_TYPES.map((k) => [k, choices[k] === true])
    ) as ConsentState;

    const res = await fetch("/api/privacy/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consents }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("לא הצלחנו לשמור את הבחירות. נסה שוב.");
      return;
    }
    router.replace("/home");
  }

  return (
    <div className="mx-auto max-w-lg pb-10">
      <PageHeaderV2 title="פרטיות ו־AI" />

      {step === "intro" && (
        <Surface depth="raised" className="space-y-4 p-5">
          <h2 className="text-xl font-semibold text-v2-text-primary">
            איך ה־AI של REMATCHER עובד עם המידע שלך
          </h2>
          <div className="space-y-3 text-[15px] leading-relaxed text-v2-text-secondary">
            <p>
              REMATCHER כוללת סוכן AI אישי שעובד איתך ומוח בורסה שעוזר למערכת
              ללמוד אילו חיבורים בין ביקוש למלאי עשויים להתפתח לעסקאות.
            </p>
            <p>
              אתה שולט באופן שבו המידע שלך משמש לזיכרון וללמידה. במסכים הבאים
              תוכל לבחור בנפרד מה אתה מאשר.
            </p>
            <p>
              גם אם לא תאשר שימושים אופציונליים, REMATCHER עדיין תוכל לעבד את
              המידע הדרוש להפעלת השירות והפעולות שאתה מבקש לבצע.
            </p>
          </div>
          <ButtonV2
            variant="primary"
            className="w-full"
            onClick={() => setStep("DEALER_MEMORY")}
          >
            המשך
          </ButtonV2>
          <Link
            href="/privacy"
            target="_blank"
            className="block text-center text-sm text-v2-warm underline underline-offset-2"
          >
            למדיניות הפרטיות המלאה
          </Link>
        </Surface>
      )}

      {consentIndex >= 0 && (
        <ConsentStep
          screen={CONSENT_SCREENS[consentIndex]}
          value={choices[CONSENT_SCREENS[consentIndex].key]}
          onSelect={(value) =>
            setChoices((prev) => ({
              ...prev,
              [CONSENT_SCREENS[consentIndex].key]: value,
            }))
          }
          onBack={() => {
            if (consentIndex === 0) setStep("intro");
            else setStep(CONSENT_SCREENS[consentIndex - 1].key);
          }}
          onContinue={() =>
            goNextFromConsent(CONSENT_SCREENS[consentIndex].key)
          }
        />
      )}

      {step === "summary" && (
        <Surface depth="raised" className="space-y-5 p-5">
          <h2 className="text-xl font-semibold text-v2-text-primary">
            הבחירות שלך
          </h2>
          <ul className="space-y-3">
            {PRIVACY_CONSENT_TYPES.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 border-b border-v2-border pb-3"
              >
                <span className="text-sm text-v2-text-primary">
                  {PRIVACY_CONSENT_LABELS_HE[key]}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      choices[key] === true
                        ? "bg-v2-warm text-white"
                        : "bg-v2-surface-secondary text-v2-text-secondary"
                    }`}
                    onClick={() =>
                      setChoices((prev) => ({ ...prev, [key]: true }))
                    }
                  >
                    מאשר
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      choices[key] === false
                        ? "bg-v2-warm text-white"
                        : "bg-v2-surface-secondary text-v2-text-secondary"
                    }`}
                    onClick={() =>
                      setChoices((prev) => ({ ...prev, [key]: false }))
                    }
                  >
                    לא מאשר
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-v2-text-muted">
            מצב נוכחי:{" "}
            {PRIVACY_CONSENT_TYPES.map((k) => choiceLabel(choices[k])).join(
              " · "
            )}
          </p>

          <div className="space-y-3 border-t border-v2-border pt-4">
            <h3 className="text-lg font-semibold text-v2-text-primary">
              תנאי שימוש ומדיניות פרטיות
            </h3>
            <div className="space-y-2 text-[15px] leading-relaxed text-v2-text-secondary">
              <p>
                קראתי את תנאי השימוש ואת מדיניות הפרטיות של REMATCHER. הוצגו
                בפניי סוגי השימוש העיקריים במידע והבחירות שביצעתי ביחס לשימושים
                האופציונליים.
              </p>
              <p>
                אני מאשר/ת את תנאי השימוש ומדיניות הפרטיות ומבין/ה שניתן לשנות
                את הרשאות הפרטיות הזמינות לי בכל עת דרך הגדרות החשבון, בכפוף
                לתנאים המפורטים במדיניות.
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm text-v2-text-primary">
              <input
                type="checkbox"
                className="mt-1"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
              />
              <span>אני מאשר/ת את האמור לעיל</span>
            </label>
            <div className="flex gap-4 text-sm">
              <Link
                href="/privacy"
                target="_blank"
                className="text-v2-warm underline underline-offset-2"
              >
                מדיניות הפרטיות
              </Link>
              <Link
                href="/terms"
                target="_blank"
                className="text-v2-warm underline underline-offset-2"
              >
                תנאי השימוש
              </Link>
            </div>
          </div>

          {error && <p className="text-sm text-warning">{error}</p>}

          <div className="flex gap-2">
            <ButtonV2
              variant="secondary"
              className="flex-1"
              onClick={() => setStep("EXTERNAL_ACTIVITY_LEARNING")}
            >
              חזרה
            </ButtonV2>
            <ButtonV2
              variant="primary"
              className="flex-1"
              disabled={!legalAccepted || submitting}
              onClick={complete}
            >
              {submitting ? "שומר..." : "מאשר/ת וממשיך/ה"}
            </ButtonV2>
          </div>
        </Surface>
      )}
    </div>
  );
}

function ConsentStep({
  screen,
  value,
  onSelect,
  onBack,
  onContinue,
}: {
  screen: (typeof CONSENT_SCREENS)[number];
  value: Choice;
  onSelect: (v: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <Surface depth="raised" className="space-y-4 p-5">
      <h2 className="text-xl font-semibold text-v2-text-primary">
        {screen.title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-v2-text-secondary">
        {screen.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            value === true
              ? "border-v2-warm bg-v2-warm text-white"
              : "border-v2-border bg-v2-surface-secondary text-v2-text-primary"
          }`}
          onClick={() => onSelect(true)}
        >
          מאשר
        </button>
        <button
          type="button"
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            value === false
              ? "border-v2-warm bg-v2-warm text-white"
              : "border-v2-border bg-v2-surface-secondary text-v2-text-primary"
          }`}
          onClick={() => onSelect(false)}
        >
          לא מאשר
        </button>
      </div>
      {screen.helper && (
        <p className="text-sm text-v2-text-muted">{screen.helper}</p>
      )}
      <div className="flex gap-2 pt-1">
        <ButtonV2 variant="secondary" className="flex-1" onClick={onBack}>
          חזרה
        </ButtonV2>
        <ButtonV2
          variant="primary"
          className="flex-1"
          disabled={value === null}
          onClick={onContinue}
        >
          המשך
        </ButtonV2>
      </div>
    </Surface>
  );
}
