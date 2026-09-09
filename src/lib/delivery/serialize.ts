import { majorUnitsFromMinor } from "@/lib/money";
import {
  deliveryAllowedTransitions,
  deliveryStatusLabel,
} from "@/lib/delivery/status";
import { getDeliveryProvider } from "@/lib/delivery/providers/registry";

export interface DeliveryEventView {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  toStatusLabel: string;
  cause: string;
  actorRole: string | null;
  details: string | null;
  createdAt: string;
}

export interface DeliveryFeeLineView {
  label: string;
  amountNaira: number;
}

// Operations-facing full delivery: fee breakdown, audit trail, transitions.
export interface DeliveryView {
  id: string;
  requestId: string;
  reference: string;
  provider: string;
  providerLabel: string;
  status: string;
  statusLabel: string;
  pickup: string | null;
  dropLocation: string | null;
  feeNaira: number;
  feeBreakdown: DeliveryFeeLineView[];
  eta: string | null;
  trackingUrl: string | null;
  trackingReference: string | null;
  proofType: string | null;
  proofReference: string | null;
  proofNote: string | null;
  recipientName: string | null;
  deliveredAt: string | null;
  notes: string | null;
  allowedTransitions: string[];
  events: DeliveryEventView[];
  createdAt: string;
  updatedAt: string;
}

// Customer-facing tracking. Internal details (fees, courier ids, notes,
// breakdown) are deliberately omitted — the customer sees progress, ETA and
// proof only.
export interface DeliveryTrackerView {
  id: string;
  reference: string;
  providerLabel: string;
  status: string;
  statusLabel: string;
  dropLocation: string | null;
  eta: string | null;
  trackingUrl: string | null;
  recipientName: string | null;
  deliveredAt: string | null;
  proofType: string | null;
  events: DeliveryEventView[];
  updatedAt: string;
}

type DeliveryEventRow = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  cause: string;
  actorRole: string | null;
  details: string | null;
  createdAt: Date;
};

type DeliveryRow = {
  id: string;
  requestId: string;
  reference: string;
  provider: string;
  status: string;
  pickup: string | null;
  dropLocation: string | null;
  feeKobo: number;
  feeBreakdown: string;
  eta: Date | null;
  trackingUrl: string | null;
  trackingReference: string | null;
  proofType: string | null;
  proofReference: string | null;
  proofNote: string | null;
  recipientName: string | null;
  deliveredAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  events?: DeliveryEventRow[];
};

export type { DeliveryRow, DeliveryEventRow };

function serializeEvents(
  events: DeliveryEventRow[] | undefined,
): DeliveryEventView[] {
  return (events ?? []).map((event) => ({
    id: event.id,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    toStatusLabel: deliveryStatusLabel(event.toStatus),
    cause: event.cause,
    actorRole: event.actorRole,
    details: event.details,
    createdAt: event.createdAt.toISOString(),
  }));
}

function parseFeeBreakdown(encoded: string): DeliveryFeeLineView[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed)
      ? parsed.filter(
          (line): line is { label: string; amountKobo: number } =>
            typeof line === "object" &&
            line !== null &&
            typeof (line as { label?: unknown }).label === "string" &&
            typeof (line as { amountKobo?: unknown }).amountKobo === "number",
        ).map((line) => ({
          label: line.label,
          amountNaira: majorUnitsFromMinor(line.amountKobo),
        }))
      : [];
  } catch {
    return [];
  }
}

export function serializeDelivery(row: DeliveryRow): DeliveryView {
  return {
    id: row.id,
    requestId: row.requestId,
    reference: row.reference,
    provider: row.provider,
    providerLabel: getDeliveryProvider(row.provider).label,
    status: row.status,
    statusLabel: deliveryStatusLabel(row.status),
    pickup: row.pickup,
    dropLocation: row.dropLocation,
    feeNaira: majorUnitsFromMinor(row.feeKobo),
    feeBreakdown: parseFeeBreakdown(row.feeBreakdown),
    eta: row.eta ? row.eta.toISOString() : null,
    trackingUrl: row.trackingUrl,
    trackingReference: row.trackingReference,
    proofType: row.proofType,
    proofReference: row.proofReference,
    proofNote: row.proofNote,
    recipientName: row.recipientName,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    notes: row.notes,
    allowedTransitions: deliveryAllowedTransitions(row.status),
    events: serializeEvents(row.events),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeDeliveryTracker(
  row: DeliveryRow,
): DeliveryTrackerView {
  return {
    id: row.id,
    reference: row.reference,
    providerLabel: getDeliveryProvider(row.provider).label,
    status: row.status,
    statusLabel: deliveryStatusLabel(row.status),
    dropLocation: row.dropLocation,
    eta: row.eta ? row.eta.toISOString() : null,
    trackingUrl: row.trackingUrl,
    recipientName: row.recipientName,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    proofType: row.proofType,
    events: serializeEvents(row.events),
    updatedAt: row.updatedAt.toISOString(),
  };
}