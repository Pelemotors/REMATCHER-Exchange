import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicLayout } from "@/components/public/public-layout";
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
        <div className="card mx-auto max-w-lg text-center">
          <h1 className="text-h2 font-bold">קיבלנו את הבקשה שלך</h1>
          <p className="mt-4 text-text-secondary">
            {BRAND.product} היא רשת פרטית לסוחרים. פרטי העסק שלך הועברו לבדיקה.
            נעדכן אותך במייל כשהחשבון יאושר.
          </p>
          <p className="mt-2 text-sm text-text-muted">
            {session.user.dealerName}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <SignOutButton />
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
