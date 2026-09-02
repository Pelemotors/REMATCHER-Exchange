import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicLayout } from "@/components/public/public-layout";
import { Surface } from "@/components/ui/brand-v2";
import { BRAND } from "@/config/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = {
  title: "בקשה בבדיקה | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default async function PendingApprovalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.emailVerifiedAt) redirect("/verify-email");
  if (session.user.verificationStatus === "VERIFIED") redirect("/home");
  if (session.user.verificationStatus === "REJECTED") redirect("/rejected");

  return (
    <PublicLayout>
      <div className="container-app py-16">
        <Surface depth="raised" className="mx-auto max-w-lg p-8 text-center">
          <h1 className="text-h2 font-bold text-v2-warm">קיבלנו את הבקשה שלך</h1>
          <p className="mt-4 text-v2-text-secondary">
            {BRAND.product} היא רשת פרטית לסוחרים. פרטי העסק שלך הועברו לבדיקה.
            נעדכן אותך במייל כשהחשבון יאושר.
          </p>
          <p className="mt-2 text-sm text-v2-text-muted">
            {session.user.dealerName}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <SignOutButton />
          </div>
        </Surface>
      </div>
    </PublicLayout>
  );
}
