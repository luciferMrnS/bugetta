// Request lifecycle statuses, stored as String constants on Request.status.
// Phase 6 defines the full order lifecycle: the customer submits (REQUESTED),
// operations researches and finds options, the customer approves and pays, then
// operations fulfills and delivers. CANCELLED / REFUNDED / DISPUTED are the
// three terminal concern states.
export const REQUEST_STATUS = {
  REQUESTED: "REQUESTED",
  RESEARCHING: "RESEARCHING",
  OPTIONS_FOUND: "OPTIONS_FOUND",
  AWAITING_CUSTOMER: "AWAITING_CUSTOMER",
  APPROVED: "APPROVED",
  PAYMENT_PENDING: "PAYMENT_PENDING",
  PAID: "PAID",
  FULFILLMENT_PENDING: "FULFILLMENT_PENDING",
  PROCESSING: "PROCESSING",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  DISPUTED: "DISPUTED",
} as const;

export type RequestStatusKey = keyof typeof REQUEST_STATUS;

// Customer-facing labels.
export const REQUEST_STATUS_LABELS: Record<RequestStatusKey, string> = {
  REQUESTED: "Requested",
  RESEARCHING: "Researching",
  OPTIONS_FOUND: "Options found",
  AWAITING_CUSTOMER: "Awaiting your decision",
  APPROVED: "Approved",
  PAYMENT_PENDING: "Pending payment",
  PAID: "Paid",
  FULFILLMENT_PENDING: "Awaiting fulfilment",
  PROCESSING: "Processing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  DISPUTED: "Under dispute",
};

// Operations-dashboard column labels.
export const OPERATOR_STATUS_LABELS: Record<RequestStatusKey, string> = {
  REQUESTED: "New requests",
  RESEARCHING: "Requests being researched",
  OPTIONS_FOUND: "Options found",
  AWAITING_CUSTOMER: "Quotes waiting for customer",
  APPROVED: "Approved orders",
  PAYMENT_PENDING: "Awaiting payment",
  PAID: "Paid orders",
  FULFILLMENT_PENDING: "Fulfilment queue",
  PROCESSING: "Processing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed orders",
  CANCELLED: "Cancelled orders",
  REFUNDED: "Refunded orders",
  DISPUTED: "Disputed orders",
};

// The happy-path lifecycle in order. CANCELLED / REFUNDED / DISPUTED are
// terminal concern states and never appear on this mainline.
export const REQUEST_LIFECYCLE: readonly RequestStatusKey[] = [
  REQUEST_STATUS.REQUESTED,
  REQUEST_STATUS.RESEARCHING,
  REQUEST_STATUS.OPTIONS_FOUND,
  REQUEST_STATUS.AWAITING_CUSTOMER,
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.PAYMENT_PENDING,
  REQUEST_STATUS.PAID,
  REQUEST_STATUS.FULFILLMENT_PENDING,
  REQUEST_STATUS.PROCESSING,
  REQUEST_STATUS.OUT_FOR_DELIVERY,
  REQUEST_STATUS.DELIVERED,
  REQUEST_STATUS.COMPLETED,
];

export const REQUEST_LIFECYCLE_POSITION: Readonly<Record<RequestStatusKey, number>> =
  Object.fromEntries(
    REQUEST_LIFECYCLE.map((status, index) => [status, index]),
  ) as Readonly<Record<RequestStatusKey, number>>;

export const TERMINAL_STATUSES: readonly RequestStatusKey[] = [
  REQUEST_STATUS.CANCELLED,
  REQUEST_STATUS.REFUNDED,
  REQUEST_STATUS.DISPUTED,
];

// The complete state machine: every transition the system may take, by any
// actor (customer decision, payment webhook, refund, or operator). Money stays
// server-authoritative — PAYMENT_PENDING → PAID only via the signed webhook and
// PAID → REFUNDED only via the operations refund path.
export const REQUEST_STATUS_TRANSITIONS: Record<
  RequestStatusKey,
  readonly RequestStatusKey[]
> = {
  REQUESTED: ["RESEARCHING", "CANCELLED"],
  RESEARCHING: ["OPTIONS_FOUND", "CANCELLED"],
  OPTIONS_FOUND: ["AWAITING_CUSTOMER", "RESEARCHING", "CANCELLED"],
  AWAITING_CUSTOMER: ["APPROVED", "OPTIONS_FOUND", "RESEARCHING", "CANCELLED"],
  APPROVED: ["PAYMENT_PENDING", "CANCELLED"],
  // PAYMENT_PENDING → PAID is the system webhook path, not an operator move.
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["FULFILLMENT_PENDING", "DISPUTED", "REFUNDED"],
  FULFILLMENT_PENDING: ["PROCESSING", "DISPUTED"],
  PROCESSING: ["OUT_FOR_DELIVERY", "DISPUTED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["COMPLETED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  REFUNDED: [],
  // Phase 11: a dispute is resolved by admin in one of two ways — REFUNDED via
  // the refund path (full refund, request moves DISPUTED → REFUNDED), or
  // COMPLETED when the dispute is decided without a refund (the order stands).
  DISPUTED: ["REFUNDED", "COMPLETED"],
};

// What an OPERATIONS user may do through the status route. Customer-only and
// system-only moves (AWAITING_CUSTOMER → APPROVED, APPROVED → PAYMENT_PENDING,
// PAYMENT_PENDING → PAID, PAID → REFUNDED) are deliberately NOT here: they are
// performed by their own guarded code paths and can never be forced by an
// operator.
export const OPERATOR_TRANSITIONS: Record<
  RequestStatusKey,
  readonly RequestStatusKey[]
> = {
  REQUESTED: ["RESEARCHING", "CANCELLED"],
  RESEARCHING: ["OPTIONS_FOUND", "CANCELLED"],
  OPTIONS_FOUND: ["AWAITING_CUSTOMER", "RESEARCHING", "CANCELLED"],
  AWAITING_CUSTOMER: ["OPTIONS_FOUND", "RESEARCHING", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  PAYMENT_PENDING: ["CANCELLED"],
  PAID: ["FULFILLMENT_PENDING", "DISPUTED"],
  FULFILLMENT_PENDING: ["PROCESSING", "DISPUTED"],
  PROCESSING: ["OUT_FOR_DELIVERY", "DISPUTED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["COMPLETED", "DISPUTED"],
  COMPLETED: ["DISPUTED"],
  CANCELLED: [],
  REFUNDED: [],
  DISPUTED: [],
};

export function requestStatusLabel(status: string): string {
  return (
    REQUEST_STATUS_LABELS[status as RequestStatusKey] ??
    REQUEST_STATUS_LABELS.REQUESTED
  );
}

export function operatorStatusLabel(status: string): string {
  return (
    OPERATOR_STATUS_LABELS[status as RequestStatusKey] ??
    OPERATOR_STATUS_LABELS.REQUESTED
  );
}

export function isRequestStatus(value: string): value is RequestStatusKey {
  return value in REQUEST_STATUS;
}

export function allowedTransitions(status: string): RequestStatusKey[] {
  return (REQUEST_STATUS_TRANSITIONS[status as RequestStatusKey] ?? []).slice();
}

export function operatorAllowedTransitions(status: string): RequestStatusKey[] {
  return (OPERATOR_TRANSITIONS[status as RequestStatusKey] ?? []).slice();
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as RequestStatusKey);
}

export function isMainlineStatus(status: string): status is RequestStatusKey {
  return (REQUEST_LIFECYCLE as readonly string[]).includes(status);
}