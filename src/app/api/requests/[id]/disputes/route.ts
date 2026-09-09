import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import {
  ensureRole,
  guardSession,
  guardCsrf,
  isSameOrigin,
} from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { raiseDisputeSchema } from "@/lib/validators/trust";
import { raiseDispute } from "@/lib/trust/disputes";
import { TrustError } from "@/lib/trust/types";
import { serializeDispute } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// POST /api/requests/[id]/disputes — open a formal dispute against a paid
// request. The request moves to DISPUTED and fraud signals re-run for everyone
// involved. Only the owning customer may raise one; at most one per request.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/disputes">,
) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  const roleBlocked = ensureRole(guard.session, [ROLES.CUSTOMER]);
  if (roleBlocked) {
    return roleBlocked;
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrfBlocked = await guardCsrf(request, guard.session);
  if (csrfBlocked !== true) {
    return csrfBlocked;
  }
  if (!rateLimit(`disputes:${guard.session.user.id}`, 10)) {
    return fail(
      "RATE_LIMITED",
      "Too many dispute actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const raw = await readJson(request);
  const parsed = raiseDisputeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The dispute is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const dispute = await raiseDispute({
      requestId: id,
      raisedById: guard.session.user.id,
      raisedByRole: ROLES.CUSTOMER,
      reason: parsed.data.reason,
      description: parsed.data.description,
      expectedResolution: parsed.data.expectedResolution,
    });
    return ok({ dispute: serializeDispute(dispute) });
  } catch (err) {
    if (err instanceof TrustError) {
      if (err.code === "NOT_FOUND") {
        return fail("NOT_FOUND", err.message, 404);
      }
      return fail(err.code, err.message, 409);
    }
    throw err;
  }
}