import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { SupplierError } from "@/lib/suppliers/service";
import { matchSuppliersToRequest } from "@/lib/suppliers/matching";

export const dynamic = "force-dynamic";

// GET /api/operations/requests/[id]/matches — rank approved suppliers against
// a paid request using the deterministic matching engine.
//
// This endpoint is read-only and has NO write path, so AI/automation can never
// unilaterally assign or move money. It produces explainable recommendations
// that the operator may accept or override via POST .../supplier (`override`).
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/operations/requests/[id]/matches">,
) {
  const guard = await guardOperations(_request);
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await ctx.params;

  try {
    const match = await matchSuppliersToRequest(id);
    return ok({ match });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}