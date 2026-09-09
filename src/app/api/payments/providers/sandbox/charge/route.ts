import type { NextRequest } from "next/server";
import { fail, ok, readJson, zodFieldErrors } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { sandboxChargeSchema } from "@/lib/validators/payments";
import {
  PaymentServiceError,
  paymentHttpStatus,
  sandboxChargePayment,
} from "@/lib/payments/service";

export const dynamic = "force-dynamic";

// The sandbox gateway confirms a checkout here. It is public by design — the
// one-time checkout token in the URL is the bearer credential, exactly like a
// real provider's payment-page callback. The outcome is then emitted as a
// signed webhook through the same capture path the public webhook uses.
export async function POST(request: NextRequest) {
  if (!rateLimit(`sandbox-charge:${request.headers.get("x-real-ip") ?? "unknown"}`, 60)) {
    return fail("RATE_LIMITED", "Too many charge attempts.", 429);
  }

  const raw = await readJson(request);
  const parsed = sandboxChargeSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "The checkout payload is invalid.", 422, {
      ...zodFieldErrors(parsed.error),
    });
  }

  try {
    const payment = await sandboxChargePayment({
      reference: parsed.data.reference,
      token: parsed.data.token,
      outcome: parsed.data.outcome,
    });
    return ok({ payment });
  } catch (err) {
    if (err instanceof PaymentServiceError) {
      return fail(err.code, err.message, paymentHttpStatus(err.code));
    }
    throw err;
  }
}