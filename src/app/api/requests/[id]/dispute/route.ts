import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession } from "@/lib/auth/guards";
import { getDisputeForRequest } from "@/lib/trust/disputes";
import { TrustError } from "@/lib/trust/types";
import { serializeDispute } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// GET /api/requests/[id]/dispute — the owning customer's dispute for a request
// (null when none). Ownership is enforced inside the service.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/dispute">,
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
  try {
    const dispute = await getDisputeForRequest({
      requestId: id,
      customerId: guard.session.user.id,
    });
    return ok({ dispute: dispute ? serializeDispute(dispute) : null });
  } catch (err) {
    if (err instanceof TrustError && err.code === "NOT_FOUND") {
      return fail("NOT_FOUND", err.message, 404);
    }
    throw err;
  }
}