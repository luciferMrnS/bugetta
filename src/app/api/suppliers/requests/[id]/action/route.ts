import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardSupplier } from "@/lib/suppliers/access";
import { rateLimit } from "@/lib/rateLimit";
import { supplierRequestActionSchema } from "@/lib/validators/supplier";
import {
  actionSupplierRequest,
  SupplierError,
} from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// POST /api/suppliers/requests/[id]/action — accept or decline an assigned
// request (ownership-checked).
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/suppliers/requests/[id]/action">,
) {
  const guard = await guardSupplier(request);
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
  if (!rateLimit(`supplier-requests:${guard.supplierId}`, 120)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const { id } = await ctx.params;
  const body = await readJson(request);
  const parsed = supplierRequestActionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Invalid action.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const requestOutput = await actionSupplierRequest(
      guard.supplierId,
      id,
      parsed.data.action,
    );
    return ok({ request: requestOutput });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}