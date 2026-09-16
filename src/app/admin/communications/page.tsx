import { AdminCommunicationsCenter } from "@/components/admin/admin-communications-center";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminCommunicationsPage() {
  if (!(await requireAdminPageSession())) return null;
  return <AdminCommunicationsCenter />;
}
