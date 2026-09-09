import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { listAllSuppliers } from "@/lib/suppliers/service";
import type { SupplierProfileOutput } from "@/lib/suppliers/serialize";
import AdminSuppliersList from "./AdminSuppliersList";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.ADMIN) {
    redirect("/");
  }

  const suppliers: SupplierProfileOutput[] = await listAllSuppliers();

  return <AdminSuppliersList initial={suppliers} />;
}