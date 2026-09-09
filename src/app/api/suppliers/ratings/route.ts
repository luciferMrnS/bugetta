import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import { supplierRatingSummary, listSupplierRatings } from "@/lib/trust/ratings";
import { supplierReliability } from "@/lib/trust/scores";
import { serializeRating } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// GET /api/suppliers/ratings — the approved supplier's rating summary,
// reliability score, and recent customer ratings.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const [summary, reliability, ratings] = await Promise.all([
    supplierRatingSummary(guard.supplierId),
    supplierReliability(guard.supplierId),
    listSupplierRatings(guard.supplierId),
  ]);
  return ok({
    summary,
    reliability,
    ratings: ratings.map((rating) => ({
      ...serializeRating(rating),
      customerName: rating.customer.name,
      requestReference: rating.request.reference,
      requestSummary: rating.request.summary,
    })),
  });
}