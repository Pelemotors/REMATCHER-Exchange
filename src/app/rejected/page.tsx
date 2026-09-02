import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicLayout } from "@/components/public/public-layout";
import { ButtonV2, Surface } from "@/components/ui/brand-v2";

export const metadata: Metadata = {
  title: "עדכון לגבי הבקשה | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default async function RejectedPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.verificationStatus !== "REJECTED") redirect("/home");

  return (
    <PublicLayout>
      <div className="container-app py-16">
        <Surface depth="raised" className="mx-auto max-w-lg p-8 text-center">
          <h1 className="text-h2 font-bold text-v2-warm">הבקשה לא אושרה</h1>
          <p className="mt-4 text-v2-text-secondary">
            תודה על פנייתך. לאחר בדיקה, לא ניתן לאשר את הבקשה כרגע. לשאלות
            נוספות ניתן לפנות אלינו.
          </p>
          <ButtonV2 variant="secondary" href="/login" className="mt-8">
            חזרה להתחברות
          </ButtonV2>
        </Surface>
      </div>
    </PublicLayout>
  );
}
