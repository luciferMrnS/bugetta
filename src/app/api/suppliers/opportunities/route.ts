import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import { listInboundOpportunities } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/suppliers/opportunities — paid, unfulfilled requests the supplier
// may be a good fit for (matched by category). These are opportunities the
// supplier can express interest in; an operations agent then assigns the
// request to a supplier before fulfilment.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const opportunities = await listInboundOpportunities(guard.supplierId);
  return ok({ opportunities });
}