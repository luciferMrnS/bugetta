import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession, guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import {
  initializePayment,
  PaymentServiceError,
  paymentHttpStatus,
} from "@/lib/payments/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  if (!rateLimit(`pay-init:${guard.session.user.id}`, 30)) {
    return fail(
      "RATE_LIMITED",
      "Too many payment actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await params;

  try {
    const initialized = await initializePayment({
      userId: guard.session.user.id,
      requestId: id,
    });
    return ok(initialized, { status: 201 });
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return fail(err.code, err.message, paymentHttpStatus(err.code));
    }
    throw err;
  }
}