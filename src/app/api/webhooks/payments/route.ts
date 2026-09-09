import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import {
  PaymentServiceError,
  paymentHttpStatus,
  processPaymentEvent,
} from "@/lib/payments/service";

export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-bugetta-signature";

// Public, intentionally sessionless: payment providers are the only legitimate
// callers, authenticated by the HMAC signature of the exact raw body. The
// signature check and the guarded PENDING->PAID write are the ONLY route into
// a captured payment.
export async function POST(request: NextRequest) {
  if (!rateLimit(`webhook:${clientKey(request)}`, 240)) {
    return fail("RATE_LIMITED", "Too many webhook calls.", 429);
  }

  const signature = request.headers.get(SIGNATURE_HEADER) ?? "";
  const rawBody = await request.text();

  try {
    const payment = await processPaymentEvent({ rawBody, signature });
    return ok({ received: true, payment });
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return fail(err.code, err.message, paymentHttpStatus(err.code));
    }
    throw err;
  }
}