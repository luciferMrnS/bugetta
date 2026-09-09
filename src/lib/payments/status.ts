// Payment lifecycle statuses, stored as String constants on Payment.status.
// Money is captured only when the signed webhook processes a `.paid` event;
// every other status change is also applied server-side in guarded writes.
export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
} as const;

export type PaymentStatusKey = keyof typeof PAYMENT_STATUS;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusKey, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

export function paymentStatusLabel(status: string): string {
  return (
    PAYMENT_STATUS_LABELS[status as PaymentStatusKey] ??
    PAYMENT_STATUS_LABELS.PENDING
  );
}

export function isPaymentStatus(value: string): value is PaymentStatusKey {
  return value in PAYMENT_STATUS;
}