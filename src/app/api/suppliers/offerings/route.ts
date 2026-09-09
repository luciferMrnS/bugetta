import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import { offeringInputSchema } from "@/lib/validators/supplier";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import {
  createOffering,
  listSupplierOfferings,
  SupplierError,
} from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/suppliers/offerings — the supplier's own catalogue.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const offerings = await listSupplierOfferings(guard.supplierId);
  return ok({ offerings });
}

// POST /api/suppliers/offerings — add a new offering (catalogue entry).
export async function POST(request: NextRequest) {
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

  const body = await readJson(request);
  const parsed = offeringInputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check the offering details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const offering = await createOffering(guard.supplierId, {
      category: parsed.data.category,
      title: parsed.data.title,
      currency: parsed.data.currency,
      priceNaira: parsed.data.priceNaira,
      description: parsed.data.description,
      availability: parsed.data.availability,
      location: parsed.data.location,
      deliveryDetail: parsed.data.deliveryDetail,
      images: parsed.data.images,
      isActive: parsed.data.isActive,
      quantityAvailable: parsed.data.quantityAvailable,
    });
    return ok({ offering }, { status: 201 });
  } catch (error) {
    if (error instanceof SupplierError) {
      return fail(error.code, error.message, error.code === "INVALID_CATEGORY" ? 422 : 409);
    }
    throw error;
  }
}