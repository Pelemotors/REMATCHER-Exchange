import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/public-layout";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "הצטרפות | REMATCHER Exchange",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <PublicLayout>
      <div className="container-app py-12">
        <SignupForm />
      </div>
    </PublicLayout>
  );
}
