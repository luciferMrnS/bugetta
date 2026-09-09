import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardAdmin } from "@/lib/suppliers/access";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { resolveComplaintSchema } from "@/lib/validators/trust";
import { resolveComplaint } from "@/lib/trust/complaints";
import { TrustError } from "@/lib/trust/types";
import { serializeComplaint } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// POST /api/admin/trust/complaints/[id] — admin resolves a complaint with a
// written outcome, closing the case.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/trust/complaints/[id]">,
) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrfBlocked = await guardCsrf(request, guard.session);
  if (csrfBlocked !== true) {
    return csrfBlocked;
  }
  if (!rateLimit(`admin-trust:${guard.session.user.id}`, 60)) {
    return fail(
      "RATE_LIMITED",
      "Too many actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const raw = await readJson(request);
  const parsed = resolveComplaintSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The resolution is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const complaint = await resolveComplaint({
      complaintId: id,
      adminUserId: guard.session.user.id,
      resolution: parsed.data.resolution,
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