// Phase 11 — disputes. Raising a dispute hands the request to the terminal
// DISPUTED state; an admin then resolves it with a full refund (through the
// existing payments/refund path) or without one (the order stands, request
// returns to COMPLETED). Dispute resolution also re-evaluates fraud signals
// for the parties involved (see lib/trust/fraud.ts).
import { prisma } from "@/lib/prisma";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { createRefund } from "@/lib/payments/service";
import type { OperationPaymentOutput } from "@/lib/payments/serialize";
import {
  DISPUTABLE_REQUEST_STATUSES,
  DISPUTE_REFUND_REASON,
  DISPUTE_STATUS,
  TrustError,
} from "@/lib/trust/types";
import { recordFraudFlags } from "@/lib/trust/fraud";

export interface RaiseDisputeInput {
  requestId: string;
  raisedById: string;
  raisedByRole: string;
  reason: string;
  description: string;
  expectedResolution?: string;
}

async function suppliersForRequest(requestId: string): Promise<string[]> {
  const rows = await prisma.supplierRequest.findMany({
    where: { requestId },
    select: { supplierId: true },
  });
  return rows.map((row) => row.supplierId);
}

export async function raiseDispute(input: RaiseDisputeInput) {
  const request = await prisma.request.findFirst({
    where: { id: input.requestId },
    select: { id: true, status: true, customerId: true },
  });
  if (!request) {
    throw new TrustError("NOT_FOUND", "Request not found.");
  }
  // A customer may only dispute their own request; operator-raised disputes
  // skip the ownership check but still need the request to exist.
  if (input.raisedByRole === "CUSTOMER" && request.customerId !== input.raisedById) {
    throw new TrustError("NOT_FOUND", "Request not found.");
  }

  const existing = await prisma.dispute.findUnique({
    where: { requestId: request.id },
    select: { id: true },
  });
  if (existing) {
    throw new TrustError(
      "DUPLICATE_DISPUTE",
      "A dispute is already open for this request.",
    );
  }

  if (
    !DISPUTABLE_REQUEST_STATUSES.includes(
      request.status as (typeof DISPUTABLE_REQUEST_STATUSES)[number],
    )
  ) {
    throw new TrustError(
      "NOT_DISPUTABLE",
      "This request cannot be disputed in its current state.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const moved = await tx.request.updateMany({
      where: { id: request.id, status: { in: [...DISPUTABLE_REQUEST_STATUSES] } },
      data: { status: REQUEST_STATUS.DISPUTED },
    });
    if (moved.count !== 1) {
      throw new TrustError("NOT_DISPUTABLE", "This request cannot be disputed now.");
    }
    await tx.requestEvent.create({
      data: {
        requestId: request.id,
        fromStatus: request.status,
        toStatus: REQUEST_STATUS.DISPUTED,
        cause: "dispute",
        actorId: input.raisedById,
        actorRole: input.raisedByRole,
      },
    });
    await tx.dispute.create({
      data: {
        reference: nextDisputeReference(),
        requestId: request.id,
        raisedById: input.raisedById,
        raisedByRole: input.raisedByRole,
        reason: input.reason,
        description: input.description.trim(),
        expectedResolution: input.expectedResolution?.trim() || null,
        status: DISPUTE_STATUS.OPEN,
      },
    });
  });

  // Deterministic fraud re-evaluation for everyone involved in the dispute.
  await recordFraudFlags("CUSTOMER", input.raisedById);
  for (const supplierId of await suppliersForRequest(request.id)) {
    await recordFraudFlags("SUPPLIER", supplierId);
  }

  const dispute = await getDisputeForRequest({ requestId: request.id });
  if (!dispute) {
    throw new TrustError("INTERNAL", "The dispute was not recorded.");
  }
  return dispute;
}

export async function getDisputeForRequest(input: {
  requestId: string;
  customerId?: string;
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { requestId: input.requestId },
    include: {
      request: {
        select: { reference: true, summary: true, status: true, customerId: true },
      },
    },
  });
  if (!dispute) {
    return null;
  }
  if (input.customerId && dispute.request.customerId !== input.customerId) {
    throw new TrustError("NOT_FOUND", "Request not found.");
  }
  return dispute;
}

export async function listDisputes(input: { status?: string; limit?: number } = {}) {
  return prisma.dispute.findMany({
    where: input.status ? { status: input.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
    include: {
      request: {
        select: {
          reference: true,
          summary: true,
          status: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function getDispute(id: string) {
  return prisma.dispute.findUnique({
    where: { id },
    include: {
      request: {
        select: {
          reference: true,
          summary: true,
          status: true,
          customer: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export type DisputeDecision = "REFUND" | "NO_REFUND";

// Admin resolution. REFUND routes through the same createRefund path as a
// manual ops refund (money stays server-authoritative). NO_REFUND returns the
// request to COMPLETED since the order stands.
export async function resolveDispute(input: {
  disputeId: string;
  adminUserId: string;
  decision: DisputeDecision;
  resolutionNote?: string;
}): Promise<{
  dispute: NonNullable<Awaited<ReturnType<typeof getDispute>>>;
  payment?: OperationPaymentOutput;
}> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: { request: { select: { status: true } } },
  });
  if (!dispute) {
    throw new TrustError("NOT_FOUND", "Dispute not found.");
  }
  if (
    dispute.status !== DISPUTE_STATUS.OPEN &&
    dispute.status !== DISPUTE_STATUS.IN_REVIEW
  ) {
    throw new TrustError("ALREADY_RESOLVED", "This dispute is already resolved.");
  }

  const note = input.resolutionNote?.trim() || null;

  if (input.decision === "REFUND") {
    const payment = await prisma.payment.findFirst({
      where: { requestId: dispute.requestId, status: "PAID" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!payment) {
      throw new TrustError(
        "NO_PAID_PAYMENT",
        "No paid payment on this request to refund.",
      );
    }
    const refunded = await createRefund({
      paymentId: payment.id,
      operatorUserId: input.adminUserId,
      reason: note ? `${DISPUTE_REFUND_REASON} ${note}` : DISPUTE_REFUND_REASON,
    });

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: DISPUTE_STATUS.RESOLVED_REFUND,
        resolutionNote: note,
        refundReference: refunded.refunds[0]?.reference ?? null,
        resolvedById: input.adminUserId,
        resolvedAt: new Date(),
      },
    });

    await recordFraudFlags("CUSTOMER", dispute.raisedById);

    const refreshed = await getDispute(dispute.id);
    if (!refreshed) {
      throw new TrustError("NOT_FOUND", "Dispute not found.");
    }
    return { dispute: refreshed, payment: refunded };
  }

  // NO_REFUND: the order stands, the request returns to completion.
  await prisma.$transaction(async (tx) => {
    const moved = await tx.request.updateMany({
      where: { id: dispute.requestId, status: REQUEST_STATUS.DISPUTED },
      data: { status: REQUEST_STATUS.COMPLETED },
    });
    if (moved.count === 1) {
      await tx.requestEvent.create({
        data: {
          requestId: dispute.requestId,
          fromStatus: REQUEST_STATUS.DISPUTED,
          toStatus: REQUEST_STATUS.COMPLETED,
          cause: "admin",
          actorId: input.adminUserId,
          actorRole: "ADMIN",
        },
      });
    }
  });

  await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: DISPUTE_STATUS.RESOLVED_NO_REFUND,
      resolutionNote: note,
      resolvedById: input.adminUserId,
      resolvedAt: new Date(),
    },
  });

  const refreshed = await getDispute(dispute.id);
  if (!refreshed) {
    throw new TrustError("NOT_FOUND", "Dispute not found.");
  }
  return { dispute: refreshed };
}

let disputeCounter = 0;
function nextDisputeReference(): string {
  const time = Date.now().toString(36).toUpperCase();
  disputeCounter += 1;
  return `DSP-${time}${disputeCounter.toString(36).toUpperCase().padStart(4, "0")}`;
}