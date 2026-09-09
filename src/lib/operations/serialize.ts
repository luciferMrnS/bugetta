import { majorUnitsFromMinor, formatNaira } from "@/lib/money";
import { categoryLabel } from "@/lib/requests/categories";
import {
  requestStatusLabel,
  operatorStatusLabel,
  operatorAllowedTransitions,
} from "@/lib/requests/status";
import {
  serializeStatusEvent,
  type RequestEventRow,
  type RequestStatusEventView,
} from "@/lib/requests/events";
import { quoteStatusLabel } from "@/lib/operations/quotes";
import { totalKobo } from "@/lib/operations/pricing";
import {
  serializeOperationPayment,
  type PaymentRow,
  type OperationPaymentOutput,
} from "@/lib/payments/serialize";

export interface OperationOptionOutput {
  id: string;
  supplier: string;
  productName: string;
  priceNaira: number | null;
  availability: string | null;
  estimatedDelivery: string | null;
  notes: string | null;
  terms: string | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OperationQuoteOutput {
  id: string;
  optionId: string | null;
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
  source: string; // MANUAL | AUTO
  createdAt: string;
}

export interface OperationRequestOutput {
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
  operatorStatusLabel: string;
  allowedTransitions: string[];
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: string | null;
    note: string | null;
  }>;
  options: OperationOptionOutput[];
  quotes: OperationQuoteOutput[];
  payments: OperationPaymentOutput[];
  statusEvents: RequestStatusEventView[];
}

type OptionRow = {
  id: string;
  supplier: string;
  productName: string;
  priceKobo: number | null;
  availability: string | null;
  estimatedDelivery: string | null;
  notes: string | null;
  terms: string | null;
  images: string;
  createdAt: Date;
  updatedAt: Date;
};

type QuoteRow = {
  id: string;
  optionId: string | null;
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
  source: string;
  createdAt: Date;
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
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    quantity: string | null;
    note: string | null;
  }>;
  options: OptionRow[];
  quotes: QuoteRow[];
  payments?: PaymentRow[];
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

export function serializeOption(row: OptionRow): OperationOptionOutput {
  return {
    id: row.id,
    supplier: row.supplier,
    productName: row.productName,
    priceNaira: row.priceKobo === null ? null : majorUnitsFromMinor(row.priceKobo),
    availability: row.availability,
    estimatedDelivery: row.estimatedDelivery,
    notes: row.notes,
    terms: row.terms,
    images: parseImages(row.images),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeQuote(row: QuoteRow): OperationQuoteOutput {
  const total = totalKobo({
    priceKobo: row.priceKobo,
    serviceFeeKobo: row.serviceFeeKobo,
    deliveryFeeKobo: row.deliveryFeeKobo,
  });
  return {
    id: row.id,
    optionId: row.optionId,
    productName: row.productName,
    priceNaira: majorUnitsFromMinor(row.priceKobo),
    serviceFeeNaira: majorUnitsFromMinor(row.serviceFeeKobo),
    deliveryFeeNaira: majorUnitsFromMinor(row.deliveryFeeKobo),
    totalNaira: majorUnitsFromMinor(total),
    information: row.information,
    images: parseImages(row.images),
    estimatedDelivery: row.estimatedDelivery,
    terms: row.terms,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    status: row.status,
    statusLabel: quoteStatusLabel(row.status),
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeOperationsRequest(row: RequestRow): OperationRequestOutput {
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
    operatorStatusLabel: operatorStatusLabel(row.status),
    allowedTransitions: operatorAllowedTransitions(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      email: row.customer.email,
      phone: row.customer.phone,
    },
    items: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      note: item.note,
    })),
    options: row.options.map(serializeOption),
    quotes: row.quotes.map(serializeQuote),
    payments: (row.payments ?? []).map(serializeOperationPayment),
    statusEvents: (row.events ?? []).map(serializeStatusEvent),
  };
}

// Lightweight dashboard card: enough to scan and open without loading options.
export interface OperationRequestCard {
  id: string;
  reference: string;
  summary: string;
  status: string;
  statusLabel: string;
  categoryLabel: string;
  budgetNaira: number | null;
  location: string | null;
  createdAt: string;
  customerName: string;
}

type CardRow = {
  id: string;
  reference: string;
  summary: string;
  status: string;
  category: string;
  budgetKobo: number | null;
  location: string | null;
  createdAt: Date;
  customer: { name: string };
};

export function serializeOperationsRequestCard(row: CardRow): OperationRequestCard {
  return {
    id: row.id,
    reference: row.reference,
    summary: row.summary,
    status: row.status,
    statusLabel: requestStatusLabel(row.status),
    categoryLabel: categoryLabel(row.category),
    budgetNaira:
      row.budgetKobo === null ? null : majorUnitsFromMinor(row.budgetKobo),
    location: row.location,
    createdAt: row.createdAt.toISOString(),
    customerName: row.customer.name,
  };
}

export { formatNaira };