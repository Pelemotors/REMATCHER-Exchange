import "server-only";
import { adminAuth } from "@/lib/admin-auth";
import { isAdminRole } from "@/lib/brand-copy";

/** Gate admin server pages — admin cookie only. */
export async function requireAdminPageSession() {
  const session = await adminAuth();
  if (!session?.user?.id || !isAdminRole(session.user.role)) {
    return null;
  }
  return session;
}
