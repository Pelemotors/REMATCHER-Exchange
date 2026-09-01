import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/public-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "שכחתי סיסמה | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <PublicLayout>
      <div className="container-app flex min-h-[70vh] items-center justify-center py-12">
        <ForgotPasswordForm />
      </div>
    </PublicLayout>
  );
}
