import { majorUnitsFromMinor } from "@/lib/money";
import { categoryLabel } from "@/lib/requests/categories";
import { requestStatusLabel } from "@/lib/requests/status";
import { quoteStatusLabel } from "@/lib/operations/quotes";
import { totalKobo } from "@/lib/operations/pricing";
import {
  serializePayment,
  type PaymentRow,
  type PaymentView,
} from "@/lib/payments/serialize";
import {
  serializeStatusEvent,
  type RequestEventRow,
  type RequestStatusEventView,
} from "@/lib/requests/events";

export interface RequestItemOutput {
  id: string;
  name: string;
  quantity: string | null;
  note: string | null;
}

// The customer-appropriate portion of a quote: what, how much (with the fee
// breakdown), when and any related terms. Internal supplier/option details are
// never serialized here. The total is recomputed server-side in kobo, it is
// never taken from input.
export interface RequestQuoteView {
  id: string;
  productName: string;
  priceNaira: number;
  serviceFeeNaira: number;
  deliveryFeeNaira: number;
  totalNaira: number;
  information: string | null;
  images: string[];
  estimatedDelivery: string | null;
  terms: string | null;
  validUntil: string | null;
  status: string;
  statusLabel: string;
}

export interface RequestOutput {
  id: string;
  reference: string;
  category: string;
  categoryLabel: string;
  summary: string;
  description: string;
  budgetNaira: number | null;
  quantity: string | null;
  location: string | null;
  deliveryDeadline: string | null;
  instructions: string | null;
  images: string[];
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  items: RequestItemOutput[];
  quotes: RequestQuoteView[];
  payment: PaymentView | null;
  statusEvents: RequestStatusEventView[];
}

type QuoteRow = {
  id: string;
  productName: string;
  priceKobo: number;
  serviceFeeKobo: number;
  deliveryFeeKobo: number;
  information: string | null;
  images: string;
  estimatedDelivery: string | null;
  terms: string | null;
  validUntil: Date | null;
  status: string;
};

type RequestRow = {
  id: string;
  reference: string;
  category: string;
  summary: string;
  description: string;
  budgetKobo: number | null;
  quantity: string | null;
  location: string | null;
  deliveryDeadline: Date | null;
  instructions: string | null;
  images: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    name: string;
    quantity: string | null;
    note: string | null;
  }>;
  // Only quotes the customer may act on or has approved (PENDING + ACCEPTED)
  // are surfaced. DECLINED/EXPIRED quotes are never shown.
  quotes?: QuoteRow[];
  // Latest payment attempt, newest first (detail view only).
  payments?: PaymentRow[];
  // Immutable status history, earliest first (detail view only).
  events?: RequestEventRow[];
};

function parseImages(encoded: string): string[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function serializeQuoteView(quote: QuoteRow): RequestQuoteView {
  return {
    id: quote.id,
    productName: quote.productName,
    priceNaira: majorUnitsFromMinor(quote.priceKobo),
    serviceFeeNaira: majorUnitsFromMinor(quote.serviceFeeKobo),
    deliveryFeeNaira: majorUnitsFromMinor(quote.deliveryFeeKobo),
    totalNaira: majorUnitsFromMinor(
      totalKobo({
        priceKobo: quote.priceKobo,
        serviceFeeKobo: quote.serviceFeeKobo,
        deliveryFeeKobo: quote.deliveryFeeKobo,
      }),
    ),
    information: quote.information ? quote.information : null,
    images: parseImages(quote.images),
    estimatedDelivery: quote.estimatedDelivery ? quote.estimatedDelivery : null,
    terms: quote.terms ? quote.terms : null,
    validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
    status: quote.status,
    statusLabel: quoteStatusLabel(quote.status),
  };
}

function serializeQuotes(quotes: QuoteRow[] | undefined): RequestQuoteView[] {
  return (quotes ?? []).map(serializeQuoteView);
}

export function serializeRequest(row: RequestRow): RequestOutput {
  return {
    id: row.id,
    reference: row.reference,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    summary: row.summary,
    description: row.description,
    budgetNaira:
      row.budgetKobo === null ? null : majorUnitsFromMinor(row.budgetKobo),
    quantity: row.quantity,
    location: row.location,
    deliveryDeadline: row.deliveryDeadline
      ? row.deliveryDeadline.toISOString()
      : null,
    instructions: row.instructions,
    images: parseImages(row.images),
    status: row.status,
    statusLabel: requestStatusLabel(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      note: item.note,
    })),
    quotes: serializeQuotes(row.quotes),
    payment:
      row.payments && row.payments.length > 0
        ? serializePayment(row.payments[0])
        : null,
    statusEvents: (row.events ?? []).map(serializeStatusEvent),
  };
}