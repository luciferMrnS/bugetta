// Customer-quote lifecycle. Quotes are created by operations (Phase 3);
// customer acceptance happens in Phase 4.
export const QUOTE_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
} as const;

export type QuoteStatusKey = keyof typeof QUOTE_STATUS;

export const QUOTE_STATUS_LABELS: Record<QuoteStatusKey, string> = {
  PENDING: "Offer ready",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export function quoteStatusLabel(status: string): string {
  return (
    QUOTE_STATUS_LABELS[status as QuoteStatusKey] ?? QUOTE_STATUS_LABELS.PENDING
  );
}