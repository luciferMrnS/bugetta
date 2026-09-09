import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardAdmin } from "@/lib/suppliers/access";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { resolveDisputeSchema } from "@/lib/validators/trust";
import { resolveDispute } from "@/lib/trust/disputes";
import { TrustError } from "@/lib/trust/types";
import { serializeDispute } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// POST /api/admin/trust/disputes/[id] — admin resolves a dispute. REFUND issues
// a full refund through the payments refund path (request DISPUTED → REFUNDED);
// NO_REFUND returns the request to COMPLETED (the order stands).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/trust/disputes/[id]">,
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
  const parsed = resolveDisputeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The resolution is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const result = await resolveDispute({
      disputeId: id,
      adminUserId: guard.session.user.id,
      decision: parsed.data.decision,
      resolutionNote: parsed.data.resolutionNote,
    });
    return ok({ dispute: serializeDispute(result.dispute) });
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