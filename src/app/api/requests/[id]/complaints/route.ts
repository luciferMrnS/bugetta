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
import { raiseComplaintSchema } from "@/lib/validators/trust";
import { raiseComplaint } from "@/lib/trust/complaints";
import { TrustError } from "@/lib/trust/types";
import { serializeComplaint } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// POST /api/requests/[id]/complaints — the owning customer reports an issue
// (about a supplier attached to this request). The linked request must belong
// to the caller; the complaint feeds deterministic fraud signals for the
// subject. At most one open complaint per subject pair is surfaced to admins.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/complaints">,
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
  if (!rateLimit(`complaints:${guard.session.user.id}`, 10)) {
    return fail(
      "RATE_LIMITED",
      "Too many complaint actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const raw = await readJson(request);
  const parsed = raiseComplaintSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The complaint is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const complaint = await raiseComplaint({
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      requestId: parsed.data.requestId ?? id,
      raisedById: guard.session.user.id,
      expectedOwnerId: guard.session.user.id,
      category: parsed.data.category,
      description: parsed.data.description,
    });
    return ok({ complaint: serializeComplaint(complaint) });
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