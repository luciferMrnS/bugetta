// Delivery lifecycle statuses, stored as String constants on Delivery.status
// (mirrors the Request lifecycle pattern). Delivery drives the logistics tail
// of an order: after the customer pays and the supplier fulfils, operations
// assigns a delivery which travels ASSIGNED → PICKED_UP → IN_TRANSIT →
// OUT_FOR_DELIVERY → DELIVERED. FAILED and CANCELLED are terminal concern
// states that let ops retry or drop a delivery without losing the audit trail.
export const DELIVERY_STATUS = {
  ASSIGNED: "ASSIGNED",
  PICKED_UP: "PICKED_UP",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type DeliveryStatusKey = keyof typeof DELIVERY_STATUS;

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatusKey, string> = {
  ASSIGNED: "Assigned to courier",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  CANCELLED: "Cancelled",
};

// The happy-path lifecycle in order. FAILED / CANCELLED never appear on it.
export const DELIVERY_LIFECYCLE: readonly DeliveryStatusKey[] = [
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.IN_TRANSIT,
  DELIVERY_STATUS.OUT_FOR_DELIVERY,
  DELIVERY_STATUS.DELIVERED,
];

export const DELIVERY_LIFECYCLE_POSITION: Readonly<
  Record<DeliveryStatusKey, number>
> = Object.fromEntries(
  DELIVERY_LIFECYCLE.map((status, index) => [status, index]),
) as Readonly<Record<DeliveryStatusKey, number>>;

export const TERMINAL_DELIVERY_STATUSES: readonly DeliveryStatusKey[] = [
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.CANCELLED,
];

// The complete state machine. Every move shown here is an operator action (the
// sandbox provider never auto-transitions); providers can later emit remote
// tracking events that map onto these same guarded transitions.
export const DELIVERY_STATUS_TRANSITIONS: Record<
  DeliveryStatusKey,
  readonly DeliveryStatusKey[]
> = {
  ASSIGNED: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "FAILED", "CANCELLED"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["CANCELLED"],
  CANCELLED: [],
};

export function isDeliveryStatus(value: string): value is DeliveryStatusKey {
  return value in DELIVERY_STATUS;
}

export function deliveryStatusLabel(status: string): string {
  return (
    DELIVERY_STATUS_LABELS[status as DeliveryStatusKey] ??
    DELIVERY_STATUS_LABELS.ASSIGNED
  );
}

export function deliveryAllowedTransitions(
  status: string,
): DeliveryStatusKey[] {
  return (DELIVERY_STATUS_TRANSITIONS[status as DeliveryStatusKey] ?? []).slice();
}

export function isTerminalDeliveryStatus(status: string): boolean {
  return TERMINAL_DELIVERY_STATUSES.includes(status as DeliveryStatusKey);
}

export function isMainlineDeliveryStatus(
  status: string,
): status is DeliveryStatusKey {
  return (DELIVERY_LIFECYCLE as readonly string[]).includes(status);
}