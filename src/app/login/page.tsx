import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicLayout } from "@/components/public/public-layout";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "התחברות | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <PublicLayout>
      <div className="container-app flex min-h-[70vh] items-center justify-center py-12">
        <Suspense fallback={<div>טוען...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </PublicLayout>
  );
}
