import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// The signed payload a gateway (sandbox or, later, a real provider) posts to
// /api/webhooks/payments. The customer is never the source of these events —
// there is no code path that marks a payment paid from client input.
export const PAYMENT_EVENT_TYPES = [
  "payment.paid",
  "payment.failed",
  "payment.refunded",
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export const paymentEventSchema = z
  .object({
    type: z.enum(PAYMENT_EVENT_TYPES),
    paymentReference: z.string().min(1, "paymentReference is required."),
    providerReference: z.string().min(1, "providerReference is required."),
    amountKobo: z
      .number()
      .int("amountKobo must be a whole number.")
      .nonnegative("amountKobo cannot be negative."),
    currency: z.string().min(1, "currency is required."),
    occurredAt: z.string().min(1, "occurredAt is required."),
    reason: z.string().optional(),
  })
  .strict();

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

// Deterministic HMAC-SHA256 over the RAW webhook body. Signatures are checked
// timing-safely, so a forged payload can never be distinguished by timing.
export function signWebhook(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhook(secret, rawBody), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

// Constant-time comparison for capability tokens (e.g. the checkout token).
export function tokenMatches(provided: string, expected: string): boolean {
  if (typeof provided !== "string") {
    return false;
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}