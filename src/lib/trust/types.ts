// Phase 11 — Ratings, Trust & Disputes: shared constants and types.
//
// All statuses are stored as String constants (like roles and request status)
// so the schema stays portable across SQLite (dev) and PostgreSQL (prod).

export const RATING_MIN = 1;
export const RATING_MAX = 5;

// A customer may rate the supplier(s) who served a request once the order has
// left the pre-money stages. CANCELLED / REFUNDED / DISPUTED are included so a
// customer can explain a bad experience, not just praise a good one.
export const RATING_ELIGIBLE_REQUEST_STATUSES = [
  "PAID",
  "FULFILLMENT_PENDING",
  "PROCESSING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
  "REFUNDED",
  "DISPUTED",
  "CANCELLED",
] as const;

// A request is disputable once money has moved: the customer (or an operator)
// may dispute a paid order at any point up to completion.
export const DISPUTABLE_REQUEST_STATUSES = [
  "PAID",
  "FULFILLMENT_PENDING",
  "PROCESSING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "COMPLETED",
] as const;

export const DISPUTE_REASONS = [
  "NOT_RECEIVED",
  "WHY_WRONG",
  "QUALITY",
  "BILLING",
  "OTHER",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  NOT_RECEIVED: "Order not received",
  WHY_WRONG: "Wrong item / order",
  QUALITY: "Quality issue",
  BILLING: "Billing / charge issue",
  OTHER: "Something else",
};

export const DISPUTE_STATUS = {
  OPEN: "OPEN",
  IN_REVIEW: "IN_REVIEW",
  RESOLVED_REFUND: "RESOLVED_REFUND",
  RESOLVED_NO_REFUND: "RESOLVED_NO_REFUND",
} as const;
export type DisputeStatus = (typeof DISPUTE_STATUS)[keyof typeof DISPUTE_STATUS];

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  RESOLVED_REFUND: "Resolved with refund",
  RESOLVED_NO_REFUND: "Resolved without refund",
};

// Complaints can target a supplier, a customer, or a request.
export const COMPLAINT_SUBJECT_TYPES = [
  "SUPPLIER",
  "CUSTOMER",
  "REQUEST",
] as const;

export const COMPLAINT_CATEGORIES = [
  "LATE_DELIVERY",
  "QUALITY",
  "COMMUNICATION",
  "BILLING",
  "CONDUCT",
  "OTHER",
] as const;

export const COMPLAINT_STATUS = {
  OPEN: "OPEN",
  IN_REVIEW: "IN_REVIEW",
  RESOLVED: "RESOLVED",
} as const;

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  RESOLVED: "Resolved",
};

export const FRAUD_FLAG_STATUS = {
  FLAGGED: "FLAGGED",
  REVIEWED: "REVIEWED",
  CLEARED: "CLEARED",
} as const;

export const FRAUD_FLAG_STATUS_LABELS: Record<string, string> = {
  FLAGGED: "Flagged",
  REVIEWED: "Reviewed",
  CLEARED: "Cleared",
};

export const FRAUD_SEVERITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type FraudSeverity = (typeof FRAUD_SEVERITIES)[number];

// Deterministic fraud signals. Each code maps to evaluator logic in
// lib/trust/fraud.ts and carries a human label + default severity. Signals are
// derived from stored data only — never from a client's claim about itself.
export const FRAUD_SIGNALS = {
  CUSTOMER_MULTIPLE_OPEN_DISPUTES: {
    label: "Customer has multiple open disputes",
    defaultSeverity: "MEDIUM",
  },
  CUSTOMER_REPEATED_REFUNDS: {
    label: "Customer has repeated full refunds recently",
    defaultSeverity: "HIGH",
  },
  CUSTOMER_MULTIPLE_CANCELLATIONS: {
    label: "Customer has cancelled many requests recently",
    defaultSeverity: "LOW",
  },
  CUSTOMER_UNPAID_ABANDONED_CHECKOUTS: {
    label: "Customer has abandoned unpaid checkouts",
    defaultSeverity: "LOW",
  },
  SUPPLIER_MULTIPLE_REFUND_DISPUTES: {
    label: "Supplier's fulfilled orders refunded after disputes",
    defaultSeverity: "HIGH",
  },
  SUPPLIER_REPEATED_COMPLAINTS: {
    label: "Supplier has multiple unresolved complaints",
    defaultSeverity: "MEDIUM",
  },
  SUPPLIER_UNFULFILLED_ORDERS: {
    label: "Supplier has long-unfulfilled assignments",
    defaultSeverity: "LOW",
  },
} as const;
export type FraudSignalCode = keyof typeof FRAUD_SIGNALS;

export const DISPUTE_REFUND_REASON =
  "Dispute resolved in the customer's favour — full refund.";

export class TrustError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}