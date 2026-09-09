import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { AdminTrustCenter } from "./AdminTrustCenter";

export const dynamic = "force-dynamic";

export default async function AdminTrustPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.ADMIN) {
    redirect("/");
  }

  return <AdminTrustCenter />;
}