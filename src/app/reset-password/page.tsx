import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicLayout } from "@/components/public/public-layout";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "איפוס סיסמה | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <PublicLayout>
      <div className="container-app flex min-h-[70vh] items-center justify-center py-12">
        <Suspense fallback={<div>טוען...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </PublicLayout>
  );
}
