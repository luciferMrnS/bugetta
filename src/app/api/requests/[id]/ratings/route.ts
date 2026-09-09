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
import { submitRatingSchema } from "@/lib/validators/trust";
import { submitRating, getRatableSuppliers } from "@/lib/trust/ratings";
import { TrustError } from "@/lib/trust/types";

export const dynamic = "force-dynamic";

// GET /api/requests/[id]/ratings — the suppliers the owning customer may rate
// on this request, each with the customer's existing rating (if any). Returns
// an explicit `eligible:false` before fulfilment begins.
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/ratings">,
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
    const data = await getRatableSuppliers({
      requestId: id,
      customerId: guard.session.user.id,
    });
    return ok(data);
  } catch (err) {
    if (err instanceof TrustError && err.code === "NOT_FOUND") {
      return fail("NOT_FOUND", err.message, 404);
    }
    throw err;
  }
}

// POST /api/requests/[id]/ratings — submit (or update) the customer's 1–5 star
// rating of a supplier who served this request. One rating per combination.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/requests/[id]/ratings">,
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
  if (!rateLimit(`ratings:${guard.session.user.id}`, 30)) {
    return fail(
      "RATE_LIMITED",
      "Too many rating actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await ctx.params;
  const raw = await readJson(request);
  const parsed = submitRatingSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The rating is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const rating = await submitRating({
      requestId: id,
      customerId: guard.session.user.id,
      supplierId: parsed.data.supplierId,
      score: parsed.data.score,
      comment: parsed.data.comment,
    });
    return ok({ rating });
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