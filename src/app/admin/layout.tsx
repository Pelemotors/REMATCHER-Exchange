import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/brand-copy";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    redirect("/home");
  }
  return <>{children}</>;
}
