import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostAuthRedirect } from "@/lib/auth-routing";
import { ExchangeLanding } from "@/components/landing/v3/exchange-landing";
import { BRAND } from "@/config/brand";
import { APP_CONFIG } from "@/config/app";

export const metadata: Metadata = {
  title: `${BRAND.product} | אל תחפש ברשת — תן ל־REMATCHER לחפש בשבילך`,
  description:
    "רשת פרטית לסוחרי רכב שמחברת בין מה שהלקוחות שלך מחפשים לבין רכבים אצל סוחרים אחרים — התאמות אנונימיות עד עניין הדדי.",
  openGraph: {
    title: `${BRAND.product} | רשת פרטית לסוחרי רכב`,
    description:
      "רשת פרטית לסוחרי רכב — Capture, התאמות אנונימיות, והזדמנויות בלי לחשוף זהויות עד Mutual Interest.",
    url: APP_CONFIG.url,
    siteName: BRAND.product,
    locale: "he_IL",
    type: "website",
    images: [
      {
        url: `${APP_CONFIG.url}/brand/rematcher-r-gold.png`,
        width: 512,
        height: 512,
        alt: "REMATCHER Exchange",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.product}`,
    description:
      "רשת פרטית לסוחרי רכב — תן ל־REMATCHER לחפש בשבילך.",
  },
  alternates: { canonical: APP_CONFIG.url },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect(getPostAuthRedirect(session.user));
  }

  return <ExchangeLanding />;
}
