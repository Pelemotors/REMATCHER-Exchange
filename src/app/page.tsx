import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostAuthRedirect } from "@/lib/auth-routing";
import { PublicLayout } from "@/components/public/public-layout";
import { HeroV2 } from "@/components/landing/hero-v2";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `${BRAND.product} | רשת פרטית לסוחרי רכב`,
  description:
    "רשת פרטית לסוחרי רכב שמחברת בין המלאי שלך לבין חיפושים אמיתיים של סוחרים אחרים — בלי לפתוח את המלאי שלך לכל השוק.",
  openGraph: {
    title: `${BRAND.product} | רשת פרטית לסוחרי רכב`,
    description:
      "רשת פרטית לסוחרי רכב שמחברת בין המלאי שלך לבין חיפושים אמיתיים של סוחרים אחרים.",
    url: APP_CONFIG.url,
    siteName: BRAND.product,
    locale: "he_IL",
    type: "website",
  },
  alternates: { canonical: APP_CONFIG.url },
  robots: { index: true, follow: true },
};

const steps = [
  {
    title: "אומרים מה יש ומה מחפשים",
    body: "מעלים מלאי ופותחים חיפוש — גם בקצרה. לא צריך לנהל לוח או לסרוק שוק.",
  },
  {
    title: "REMATCHER ממשיך לעבוד ברקע",
    body: "המלאי והחיפושים נשארים ברשת. המערכת בודקת התאמות לאורך זמן — גם כשאתה לא בתוך האפליקציה.",
  },
  {
    title: "חוזרים אליך רק כשבאמת צריך",
    body: "כשחסר פרט כדי לבדוק התאמה, או כשיש הזדמנות ששווה תשומת לב. בלי רעש ובלי מלאי פתוח לכולם.",
  },
  {
    title: "עניין הדדי → חיבור ישיר",
    body: "רק אחרי ששני הצדדים בוחרים להתקדם נחשפים פרטי הקשר. עד אז הזהות נשארת פרטית.",
  },
];

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(getPostAuthRedirect(session.user));
  }

  return (
    <>
      <HeroV2 />

      <PublicLayout showHeader={false}>
        <section id="how-it-works" className="border-t border-v2-border bg-v2-surface py-16">
          <div className="container-app">
            <h2 className="mb-3 text-center text-h2 font-bold text-v2-warm">
              איך Exchange עובד
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-center text-v2-text-secondary">
              לא צריך לזכור לחזור ל-{BRAND.parent}.{" "}
              {BRAND.parent} חוזרת אליך כשנוצרת הזדמנות אמיתית — או כשחסר משהו
              רק ממך כדי לבדוק אותה.
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <Surface key={step.title} depth="raised" className="p-5">
                  <span className="text-sm font-semibold text-v2-signal">
                    {i + 1}
                  </span>
                  <h3 className="mt-2 font-semibold text-v2-text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-v2-text-secondary">
                    {step.body}
                  </p>
                </Surface>
              ))}
            </div>
          </div>
        </section>

        <section className="container-app py-16">
          <Surface depth="raised" className="mx-auto max-w-2xl p-8 text-center">
            <h2 className="text-h2 font-bold text-v2-warm">רשת פרטית — לא לוח רכב</h2>
            <p className="mt-4 text-v2-text-secondary">
              סוחרים אחרים לא גולשים במלאי שלך ולא רואים מי אתה לפני עניין הדדי.{" "}
              {BRAND.product} מחזיקה מלאי וחיפושים לאורך זמן, בודקת התאמות
              ברקע, ומציגה רק הזדמנות ששווה החלטה — לא עוד פיד לגלול.
            </p>
          </Surface>
        </section>

        <section className="border-t border-v2-border bg-v2-signal-soft/20 py-16">
          <div className="container-app text-center">
            <h2 className="text-h2 font-bold text-v2-warm">5 החיבורים הראשונים ללא עלות</h2>
            <p className="mx-auto mt-4 max-w-xl text-v2-text-secondary">
              מתחילים להשתמש ברשת, בודקים את הערך בפועל ורק לאחר מכן מחליטים איך
              להמשיך.
            </p>
          </div>
        </section>

        <section className="container-app py-16 text-center">
          <ButtonV2 variant="signal" href="/signup" className="px-10 py-3">
            הצטרפות ל-{BRAND.productShort}
          </ButtonV2>
          <p className="mt-4 text-sm text-v2-text-secondary">
            כבר יש לך חשבון?{" "}
            <Link href="/login" className="font-medium text-v2-signal">
              התחבר
            </Link>
          </p>
        </section>
      </PublicLayout>
    </>
  );
}
