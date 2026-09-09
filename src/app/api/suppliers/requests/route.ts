import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import { listAssignedRequests } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/suppliers/requests — the supplier's assigned & fulfilled orders.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const requests = await listAssignedRequests(guard.supplierId);
  return ok({ requests });
}