// Immutable status-history rows: every transition a request took, preserving
// order and the actor who caused it. Written from every status-changing code
// path (customer decisions, operator updates, payment capture, refunds).
export const STATUS_EVENT_CAUSES = [
  "created",
  "customer",
  "operator",
  "payment",
  "refund",
] as const;

export type StatusEventCause = (typeof STATUS_EVENT_CAUSES)[number];

export interface RecordStatusEventInput {
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  cause: StatusEventCause;
  actorId?: string | null;
  actorRole?: string | null;
}

export type RequestEventRow = {
  id: string;
  requestId: string;
  fromStatus: string | null;
  toStatus: string;
  cause: string;
  actorId: string | null;
  actorRole: string | null;
  createdAt: Date;
};

export interface RequestStatusEventView {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  toStatusLabel: string;
  cause: string;
  causeLabel: string;
  actorRole: string | null;
  createdAt: string;
}

export function eventCauseLabel(cause: string): string {
  switch (cause) {
    case "created":
      return "Request created";
    case "customer":
      return "Your action";
    case "operator":
      return "Operations";
    case "payment":
      return "Payment";
    case "refund":
      return "Refund";
    default:
      return cause;
  }
}

export function serializeStatusEvent(
  row: RequestEventRow,
): RequestStatusEventView {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    toStatusLabel: toStatusLabelFor(row.toStatus),
    cause: row.cause,
    causeLabel: eventCauseLabel(row.cause),
    actorRole: row.actorRole,
    createdAt: row.createdAt.toISOString(),
  };
}

// Local label so the events module does not pull in the full status module.
function toStatusLabelFor(status: string): string {
  switch (status) {
    case "REQUESTED":
      return "Requested";
    case "RESEARCHING":
      return "Researching";
    case "OPTIONS_FOUND":
      return "Options found";
    case "AWAITING_CUSTOMER":
      return "Awaiting your decision";
    case "APPROVED":
      return "Approved";
    case "PAYMENT_PENDING":
      return "Pending payment";
    case "PAID":
      return "Paid";
    case "FULFILLMENT_PENDING":
      return "Awaiting fulfilment";
    case "PROCESSING":
      return "Processing";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return "Delivered";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "REFUNDED":
      return "Refunded";
    case "DISPUTED":
      return "Under dispute";
    default:
      return status;
  }
}