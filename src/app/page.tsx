import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostAuthRedirect } from "@/lib/auth-routing";
import { PublicLayout } from "@/components/public/public-layout";
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
    title: "מספרים לנו מה יש ומה מחפשים",
    body: "מעלים מלאי ופותחים חיפושים.",
  },
  {
    title: "REMATCHER Exchange מחפש התאמות ברשת",
    body: "אין צורך לעבור על מלאים של סוחרים אחרים.",
  },
  {
    title: "כשיש עניין משני הצדדים — נוצר חיבור",
    body: "רק אז הצדדים נחשפים זה לזה.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(getPostAuthRedirect(session.user));
  }

  return (
    <PublicLayout>
      <section className="container-app py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-display font-bold text-ink md:text-[2.5rem] md:leading-tight">
            הרכב שאתה מחפש יכול כבר להיות אצל סוחר אחר.
          </h1>
          <p className="mt-6 text-body-lg text-text-secondary">
            {BRAND.product} היא רשת פרטית לסוחרי רכב שמחברת בין המלאי שלך לבין
            חיפושים אמיתיים של סוחרים אחרים — בלי לפתוח את המלאי שלך לכל השוק.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary w-full px-8 py-3 sm:w-auto">
              הצטרפות ל-Exchange
            </Link>
            <Link href="/login" className="btn-secondary w-full px-8 py-3 sm:w-auto">
              כבר רשום? התחבר
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-border bg-surface py-16">
        <div className="container-app">
          <h2 className="mb-10 text-center text-h2 font-bold">איך Exchange עובד</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <div key={step.title} className="card">
                <span className="text-sm font-semibold text-signal">{i + 1}</span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-app py-16">
        <div className="card mx-auto max-w-2xl text-center">
          <h2 className="text-h2 font-bold">המלאי שלך נשאר פרטי</h2>
          <p className="mt-4 text-text-secondary">
            סוחרים אחרים לא מקבלים גישה למלאי שלך ולא יכולים לעבור עליו.{" "}
            {BRAND.product} מציג רק הזדמנות רלוונטית כאשר יש סיבה עסקית אמיתית
            לחיבור.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-signal-soft/30 py-16">
        <div className="container-app text-center">
          <h2 className="text-h2 font-bold">5 החיבורים הראשונים ללא עלות</h2>
          <p className="mx-auto mt-4 max-w-xl text-text-secondary">
            מתחילים להשתמש ברשת, בודקים את הערך בפועל ורק לאחר מכן מחליטים איך
            להמשיך.
          </p>
        </div>
      </section>

      <section className="container-app py-16 text-center">
        <Link href="/signup" className="btn-primary inline-block px-10 py-3">
          הצטרפות ל-{BRAND.productShort}
        </Link>
        <p className="mt-4 text-sm text-text-secondary">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-medium text-signal">
            התחבר
          </Link>
        </p>
      </section>
    </PublicLayout>
  );
}
