import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { guardAdmin } from "@/lib/suppliers/access";
import { listAllSuppliers, listPendingSuppliers } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/admin/suppliers — list supplier registrations for review
// (optional ?status=PENDING filter).
export async function GET(request: NextRequest) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!rateLimit(`admin-suppliers:${guard.session.user.id}`, 120)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const suppliers =
    status === "PENDING"
      ? await listPendingSuppliers()
      : await listAllSuppliers();
  return ok({ suppliers });
}