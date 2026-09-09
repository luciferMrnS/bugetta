import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardSession, ensureRole, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { ROLES } from "@/lib/auth/roles";
import { rateLimit } from "@/lib/rateLimit";
import { supplierProfileUpdateSchema } from "@/lib/validators/supplier";
import {
  getSupplierProfile,
  updateSupplierProfile,
  SupplierError,
  registerSupplier,
} from "@/lib/suppliers/service";

export const dynamic = "force-dynamic";

// GET /api/suppliers/profile — returns the current supplier's profile.
// This is used by both the onboarding screen and the dashboard, so it works
// for any SUPPLIER-role user with a profile (pending or approved).
export async function GET(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  const blocked = ensureRole(guard.session, [ROLES.SUPPLIER]);
  if (blocked) {
    return fail("FORBIDDEN", "You are not allowed to perform this action.", 403);
  }

  const profile = await getSupplierProfile(guard.session.user.id);
  if (!profile) {
    return fail("UNBOARDING_REQUIRED", "You must complete supplier onboarding first.", 403);
  }
  return ok({ supplier: profile });
}

// PUT /api/suppliers/profile — updates the profile. Works for pending suppliers
// too, so they can review details while waiting for approval.
export async function PUT(request: NextRequest) {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard.response;
  }
  const blocked = ensureRole(guard.session, [ROLES.SUPPLIER]);
  if (blocked) {
    return fail("FORBIDDEN", "You are not allowed to perform this action.", 403);
  }
  if (!isSameOrigin(request)) {
    return fail("CSRF_ORIGIN", "Request origin is not allowed.", 403);
  }
  const csrf = await guardCsrf(request, guard.session);
  if (csrf !== true) {
    return csrf;
  }
  if (!rateLimit(`supplier-profile:${guard.session.user.id}`, 30)) {
    return fail("RATE_LIMITED", "Too many actions. Please try again in a few minutes.", 429);
  }

  const body = await readJson(request);
  const parsed = supplierProfileUpdateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "Check your details and try again.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const existing = await getSupplierProfile(guard.session.user.id);
    if (!existing) {
      // The user has the SUPPLIER role but no profile yet — complete onboarding
      // by creating it now (requires a business name).
      if (!parsed.data.businessName) {
        return fail(
          "VALIDATION_ERROR",
          "Business name is required to complete onboarding.",
          422,
        );
      }
      await registerSupplier(guard.session.user.id, {
        businessName: parsed.data.businessName,
        description: parsed.data.description,
        contactName: parsed.data.contactName,
        phone: parsed.data.phone,
        whatsapp: parsed.data.whatsapp,
        email: parsed.data.email,
        categories: parsed.data.categories,
        serviceArea: parsed.data.serviceArea,
        operatingHours: parsed.data.operatingHours,
        paymentDetails: parsed.data.paymentDetails,
        logoUrl: parsed.data.logoUrl,
      });
    }
    const profile = await updateSupplierProfile(guard.session.user.id, {
      businessName: parsed.data.businessName,
      description: parsed.data.description,
      contactName: parsed.data.contactName,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
      email: parsed.data.email,
      categories: parsed.data.categories,
      serviceArea: parsed.data.serviceArea,
      operatingHours: parsed.data.operatingHours,
      paymentDetails: parsed.data.paymentDetails,
      logoUrl: parsed.data.logoUrl,
    });
    return ok({ supplier: profile });
  } catch (error) {
    if (error instanceof SupplierError) {
      return fail(error.code, error.message, 409);
    }
    throw error;
  }
}