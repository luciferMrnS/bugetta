import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { ROLES } from "@/lib/auth/roles";
import { ensureRole, guardSession } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import {
  getPaymentForRequest,
  PaymentServiceError,
  paymentHttpStatus,
} from "@/lib/payments/service";

export const dynamic = "force-dynamic";

// Read-only payment status. The server reconciles with the provider before
// returning — the browser is never the authority on whether a payment cleared.
export async function GET(
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

  if (!rateLimit(`pay-status:${guard.session.user.id}`, 120)) {
    return fail(
      "RATE_LIMITED",
      "Too many requests. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await params;

  try {
    const payment = await getPaymentForRequest({
      userId: guard.session.user.id,
      requestId: id,
    });
    return ok({ payment });
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return fail(err.code, err.message, paymentHttpStatus(err.code));
    }
    throw err;
  }
}