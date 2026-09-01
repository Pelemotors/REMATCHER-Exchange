import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/public-layout";
import { VerifyEmailPage } from "@/components/auth/verify-email-page";

export const metadata: Metadata = {
  title: "אימות אימייל | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <PublicLayout>
      <div className="container-app py-12">
        <VerifyEmailPage />
      </div>
    </PublicLayout>
  );
}
