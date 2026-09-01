import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessExchange } from "@/lib/auth-routing";
import { AppShell } from "@/components/layout/app-shell";

export default async function DealerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!session.user.emailVerifiedAt) {
    redirect("/verify-email");
  }

  if (session.user.verificationStatus === "REJECTED") {
    redirect("/rejected");
  }

  if (session.user.verificationStatus === "PENDING") {
    redirect("/pending-approval");
  }

  if (session.user.role === "ADMIN" && !session.user.dealerId) {
    redirect("/admin");
  }

  if (!canAccessExchange(session.user) && session.user.role !== "ADMIN") {
    redirect("/pending-approval");
  }

  return <AppShell>{children}</AppShell>;
}
