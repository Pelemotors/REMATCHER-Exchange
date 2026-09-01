import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PublicLayout } from "@/components/public/public-layout";

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
        <div className="card mx-auto max-w-lg text-center">
          <h1 className="text-h2 font-bold">הבקשה לא אושרה</h1>
          <p className="mt-4 text-text-secondary">
            תודה על פנייתך. לאחר בדיקה, לא ניתן לאשר את הבקשה כרגע. לשאלות
            נוספות ניתן לפנות אלינו.
          </p>
          <Link href="/login" className="btn-secondary mt-8 inline-block">
            חזרה להתחברות
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
