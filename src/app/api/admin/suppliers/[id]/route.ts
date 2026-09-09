import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardAdmin } from "@/lib/suppliers/access";
import { rateLimit } from "@/lib/rateLimit";
import { supplierReviewSchema } from "@/lib/validators/supplier";
import { reviewSupplier, SupplierError } from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// POST /api/admin/suppliers/[id] — approve, reject, or suspend a supplier
// registration (admin-only).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/suppliers/[id]">,
) {
  const guard = await guardAdmin(request);
  if (!guard.ok) {
    return guard.response;
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrf = await guardCsrf(request, guard.session);
  if (csrf !== true) {
    return csrf;
  }
  if (!rateLimit(`admin-suppliers:${guard.session.user.id}`, 120)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const { id } = await ctx.params;
  const body = await readJson(request);
  const parsed = supplierReviewSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid review action.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const supplier = await reviewSupplier(id, parsed.data.action);
    return ok({ supplier });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}