import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getCustomerDeliveryTracker } from "@/lib/delivery/service";

export const dynamic = "force-dynamic";

// GET /api/requests/[id]/delivery — the customer's live delivery tracker. Only
// the owning customer may read it, and it exposes tracking-safe fields (status,
// ETA, tracking link, proof) — never fees, courier ids or internal notes.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/delivery">,
) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }

  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }

  const { id } = await ctx.params;
  const delivery = await getCustomerDeliveryTracker({
    requestId: id,
    customerId: guard.session.user.id,
  });
  if (delivery) {
    return ok({ delivery });
  }
  // Distinguish "you don't own this request" (404) from "request has no
  // delivery yet" (null) so the UI can show a graceful empty state.
  const owned = await prisma.request.findFirst({
    where: { id, customerId: guard.session.user.id },
    select: { id: true },
  });
  if (!owned) {
    return fail("NOT_FOUND", "No delivery found for this request.", 404);
  }
  return ok({ delivery: null });
}