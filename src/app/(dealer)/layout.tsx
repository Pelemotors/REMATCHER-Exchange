import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessExchange } from "@/lib/auth-routing";
import { AppShellV2 } from "@/components/layout/app-shell-v2";
import { hasCompletedPrivacyAiV1 } from "@/services/privacy/policy";

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

  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const onPrivacyAi = pathname.startsWith("/privacy-ai");

  if (
    session.user.dealerId &&
    session.user.id &&
    !onPrivacyAi
  ) {
    const completed = await hasCompletedPrivacyAiV1({
      userId: session.user.id,
      dealerId: session.user.dealerId,
    });
    if (!completed) {
      redirect("/privacy-ai");
    }
  }

  return (
    <div className="min-h-screen">
      <AppShellV2>{children}</AppShellV2>
    </div>
  );
}
