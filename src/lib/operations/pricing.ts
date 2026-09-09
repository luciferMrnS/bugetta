// Quote pricing lives here so the server is the single source of truth for
// money math. Everything is kept in minor units (kobo) as whole integers —
// never floats — and the total is always recomputed, never trusted from a
// client-supplied value.

export const PRICE_LIMITS_NAIRA = {
  price: 1_000_000_000,
  fee: 100_000_000,
} as const;

export interface QuoteMoneyParts {
  priceKobo: number;
  serviceFeeKobo: number;
  deliveryFeeKobo: number;
}

export function totalKobo(parts: QuoteMoneyParts): number {
  return parts.priceKobo + parts.serviceFeeKobo + parts.deliveryFeeKobo;
}