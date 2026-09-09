import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import {
  listSupplierEarnings,
  getSupplierEarningsSummary,
} from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/suppliers/earnings — ledger of supplier earnings + summary.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const [earnings, summary] = await Promise.all([
    listSupplierEarnings(guard.supplierId),
    getSupplierEarningsSummary(guard.supplierId),
  ]);
  return ok({ earnings, summary });
}