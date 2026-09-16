import { AdminProductIntelligence } from "@/components/admin/admin-product-intelligence";
import { requireAdminPageSession } from "@/lib/admin-page-gate";

export default async function AdminIntelligencePage() {
  if (!(await requireAdminPageSession())) return null;
  return <AdminProductIntelligence />;
}
