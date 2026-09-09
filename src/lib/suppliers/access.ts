import type { NextRequest, NextResponse } from "next/server";
import { ROLES } from "@/lib/auth/roles";
import { guardSession, ensureRole } from "@/lib/auth/guards";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { SessionWithUser } from "@/lib/auth/session";

export type SupplierGuard =
  | { ok: true; session: SessionWithUser; supplierId: string }
  | { ok: false; response: NextResponse };

// Session + role + supplier profile check for the supplier area. Only SUPPLIER
// users with an approved supplier profile may access supplier endpoints.
export async function guardSupplier(
  request: NextRequest,
): Promise<SupplierGuard> {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard;
  }

  const blocked = ensureRole(guard.session, [ROLES.SUPPLIER]);
  if (blocked) {
    return { ok: false, response: blocked };
  }

  const supplier = await prisma.supplier.findUnique({
    where: { userId: guard.session.user.id },
    select: { id: true, status: true },
  });

  if (!supplier) {
    return {
      ok: false,
      response: fail(
        "UNBOARDING_REQUIRED",
        "You must complete supplier onboarding first.",
        403,
      ),
    };
  }

  if (supplier.status !== "APPROVED") {
    return {
      ok: false,
      response: fail(
        "NOT_APPROVED",
        "Your supplier account is pending approval.",
        403,
      ),
    };
  }

  return { ok: true, session: guard.session, supplierId: supplier.id };
}

// Admin guard: only ADMIN users may access admin supplier-management endpoints.
export async function guardAdmin(
  request: NextRequest,
): Promise<{ ok: true; session: SessionWithUser } | { ok: false; response: NextResponse }> {
  const guard = await guardSession(request);
  if (!guard.ok) {
    return guard;
  }

  const blocked = ensureRole(guard.session, [ROLES.ADMIN]);
  if (blocked) {
    return { ok: false, response: blocked };
  }

  return guard;
}
