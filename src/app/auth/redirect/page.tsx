import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPostAuthRedirect } from "@/lib/auth-routing";

export default async function AuthRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user) {
    redirect("/login");
  }

  redirect(getPostAuthRedirect(session.user, params.callbackUrl ?? null));
}
