import { prisma } from "@/lib/prisma";
import {
  REQUEST_LIFECYCLE_POSITION,
  REQUEST_STATUS,
  type RequestStatusKey,
} from "@/lib/requests/status";
import { getDeliveryProvider } from "@/lib/delivery/providers/registry";
import type { DeliveryPriority } from "@/lib/delivery/providers/types";
import {
  deliveryAllowedTransitions,
  type DeliveryStatusKey,
} from "@/lib/delivery/status";
import {
  serializeDelivery,
  serializeDeliveryTracker,
  type DeliveryTrackerView,
  type DeliveryView,
} from "@/lib/delivery/serialize";
import { runAutomation } from "@/lib/automation/service";

export class DeliveryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const DELIVERY_INCLUDE = {
  events: { orderBy: { createdAt: "asc" as const } },
};

// Random unique reference, mirroring the REQ-/PAY- generators.
const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomReference(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `DLV-${out}`;
}

async function withUniqueReference<T extends { reference: string }>(
  build: (reference: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await build(randomReference());
    } catch (error) {
      const uniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (!uniqueViolation || attempt === 2) {
        throw error;
      }
    }
  }
  throw new DeliveryError("INTERNAL", "Could not allocate a delivery reference.");
}

function paidPosition(): number {
  return REQUEST_LIFECYCLE_POSITION[REQUEST_STATUS.PAID];
}

// Deliveries only exist for paid requests: money is settled before logistics
// begin. A terminal / not-yet-paid request cannot be assigned a courier.
function assertDeliverableStatus(status: string): void {
  const position = REQUEST_LIFECYCLE_POSITION[status as RequestStatusKey];
  if (position === undefined || position < paidPosition()) {
    throw new DeliveryError(
      "REQUEST_NOT_PAID",
      "Deliveries can be created only after the request is paid.",
    );
  }
}

export interface CreateDeliveryInput {
  requestId: string;
  operatorUserId: string;
  operatorRole: string;
  providerKey?: string | null;
  priority?: DeliveryPriority;
  dropLocation?: string | null;
  pickup?: string | null;
  notes?: string | null;
}

export async function createDeliveryForRequest(
  input: CreateDeliveryInput,
): Promise<DeliveryView> {
  const request = await prisma.request.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, location: true },
  });
  if (!request) {
    throw new DeliveryError("NOT_FOUND", "Request not found.");
  }

  assertDeliverableStatus(request.status);

  const existing = await prisma.delivery.findUnique({
    where: { requestId: input.requestId },
    select: { id: true },
  });
  if (existing) {
    throw new DeliveryError(
      "DUPLICATE_DELIVERY",
      "This request already has a delivery.",
    );
  }

  // The fee and ETA are computed server-side by the provider. A client's
  // numbers are never read here; drop/pickup are the only free-text inputs.
  const provider = getDeliveryProvider(input.providerKey);
  const dropLocation =
    input.dropLocation?.trim() || request.location || null;
  const priority = input.priority ?? "STANDARD";
  const quote = provider.quote({
    dropLocation,
    priority,
    now: new Date(),
  });
  const trackingReference = randomReference().replace("DLV-", "TRK-");
  const trackingUrl = provider.trackingUrl(trackingReference);

  const created = await withUniqueReference(async (reference) =>
    prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.create({
        data: {
          requestId: input.requestId,
          reference,
          provider: provider.key,
          status: "ASSIGNED",
          pickup: input.pickup?.trim() || null,
          dropLocation,
          feeKobo: quote.feeKobo,
          feeBreakdown: JSON.stringify(quote.breakdown),
          eta: quote.eta,
          trackingReference,
          trackingUrl,
          notes: input.notes?.trim() || null,
        },
      });
      await tx.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          fromStatus: null,
          toStatus: "ASSIGNED",
          cause: "created",
          actorId: input.operatorUserId,
          actorRole: input.operatorRole,
          details: `Assigned to ${provider.label}.`,
        },
      });
      return tx.delivery.findUniqueOrThrow({
        where: { id: delivery.id },
        include: DELIVERY_INCLUDE,
      });
    }),
  );

  return serializeDelivery(created);
}

export async function getDeliveryForRequest(
  requestId: string,
): Promise<DeliveryView | null> {
  const row = await prisma.delivery.findUnique({
    where: { requestId },
    include: DELIVERY_INCLUDE,
  });
  return row ? serializeDelivery(row) : null;
}

export async function getCustomerDeliveryTracker(input: {
  requestId: string;
  customerId: string;
}): Promise<DeliveryTrackerView | null> {
  const row = await prisma.delivery.findFirst({
    where: {
      requestId: input.requestId,
      request: { customerId: input.customerId },
    },
    include: DELIVERY_INCLUDE,
  });
  return row ? serializeDeliveryTracker(row) : null;
}

export interface TransitionDeliveryInput {
  deliveryId: string;
  operatorUserId: string;
  operatorRole: string;
  nextStatus: string;
  recipientName?: string | null;
  proofType?: string | null;
  proofReference?: string | null;
  proofNote?: string | null;
  notes?: string | null;
}

export async function transitionDeliveryStatus(
  input: TransitionDeliveryInput,
): Promise<DeliveryView> {
  const row = await prisma.delivery.findUnique({
    where: { id: input.deliveryId },
    include: DELIVERY_INCLUDE,
  });
  if (!row) {
    throw new DeliveryError("NOT_FOUND", "Delivery not found.");
  }

  const allowed = deliveryAllowedTransitions(row.status);
  if (
    !allowed.includes(input.nextStatus as DeliveryStatusKey)
  ) {
    throw new DeliveryError(
      "INVALID_TRANSITION",
      `Cannot move a delivery from ${row.status} to ${input.nextStatus}.`,
    );
  }

  const isDelivered = input.nextStatus === "DELIVERED";
  const details = isDelivered
    ? `Delivered to ${input.recipientName || "recipient"}${
        input.proofReference
          ? ` · proof: ${input.proofType || "confirmation"} ${input.proofReference}`
          : ""
      }.`
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: input.deliveryId },
      data: {
        status: input.nextStatus,
        ...(isDelivered
          ? {
              deliveredAt: new Date(),
              recipientName: input.recipientName?.trim() || row.recipientName,
              proofType: input.proofType?.trim() || row.proofType,
              proofReference:
                input.proofReference?.trim() || row.proofReference,
              proofNote: input.proofNote?.trim() || row.proofNote,
            }
          : {}),
        ...(input.notes?.trim()
          ? { notes: input.notes?.trim() || null }
          : {}),
      },
    });
    await tx.deliveryEvent.create({
      data: {
        deliveryId: input.deliveryId,
        fromStatus: row.status,
        toStatus: input.nextStatus,
        cause: "operator",
        actorId: input.operatorUserId,
        actorRole: input.operatorRole,
        details,
      },
    });
    return tx.delivery.findUniqueOrThrow({
      where: { id: input.deliveryId },
      include: DELIVERY_INCLUDE,
    });
  });

  if (isDelivered) {
    runAutomation({ trigger: "DELIVERED", requestId: updated.requestId }).catch(() => {});
  }
  return serializeDelivery(updated);
}