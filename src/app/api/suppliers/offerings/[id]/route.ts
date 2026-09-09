import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { guardSupplier } from "@/lib/suppliers/access";
import { rateLimit } from "@/lib/rateLimit";
import { offeringInputSchema } from "@/lib/validators/supplier";
import {
  updateOffering,
  deleteOffering,
  SupplierError,
} from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// PUT /api/suppliers/offerings/[id] — update a catalogue entry (ownership-
// checked).
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/suppliers/offerings/[id]">,
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
  if (!rateLimit(`supplier-offerings:${guard.supplierId}`, 60)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const { id } = await ctx.params;
  const body = await readJson(request);
  const parsed = offeringInputSchema.partial().safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the offering details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const offering = await updateOffering(guard.supplierId, id, {
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      priceNaira: parsed.data.priceNaira,
      availability: parsed.data.availability,
      location: parsed.data.location,
      deliveryDetail: parsed.data.deliveryDetail,
      images: parsed.data.images,
      isActive: parsed.data.isActive,
      quantityAvailable: parsed.data.quantityAvailable,
    });
    return ok({ offering });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      if (error.code === "INVALID_CATEGORY") return fail(error.code, error.message, 422);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}

// DELETE /api/suppliers/offerings/[id] — remove a catalogue entry (ownership-
// checked).
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/suppliers/offerings/[id]">,
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

  const { id } = await ctx.params;
  try {
    await deleteOffering(guard.supplierId, id);
    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof SupplierError) {
      if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, 404);
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}