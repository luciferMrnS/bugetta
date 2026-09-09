import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { guardCsrf, isSameOrigin } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/rateLimit";
import { createRefundSchema } from "@/lib/validators/payments";
import { prisma } from "@/lib/prisma";
import {
  createRefund,
  PaymentServiceError,
  paymentHttpStatus,
} from "@/lib/payments/service";
import { recordFraudFlags } from "@/lib/trust/fraud";

export const dynamic = "force-dynamic";

// Full refund issued by operations/admin. The amount is always the full
// captured amount, computed server-side — the client cannot choose how much.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardOperations(request);
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

  if (!rateLimit(`refunds:${guard.session.user.id}`, 20)) {
    return fail(
      "RATE_LIMITED",
      "Too many refund actions. Please try again in a few minutes.",
      429,
    );
  }

  const { id } = await params;
  const raw = await readJson(request);
  const parsed = createRefundSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The refund details are invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const payment = await createRefund({
      paymentId: id,
      operatorUserId: guard.session.user.id,
      reason: parsed.data.reason,
    });
    // A refund is a fraud-relevant event: re-run the customer's signals so a
    // repeated-refund pattern surfaces deterministically (Phase 11).
    const payer = await prisma.payment.findUnique({
      where: { id },
      select: { customerId: true },
    });
    if (payer) {
      await recordFraudFlags("CUSTOMER", payer.customerId);
    }
    return ok({ payment });
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return fail(err.code, err.message, paymentHttpStatus(err.code));
    }
    throw err;
  }
}