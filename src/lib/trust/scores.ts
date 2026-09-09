// Phase 11 — deterministic trust scores.
//
// Both scores are DERIVED analytics: they are recomputed on demand from stored
// rows, never persisted, and never fed back into the data they summarize. The
// formulas are intentionally small and documented so the numbers are auditable.
//
// Supplier reliability (0–100):
//   ratings component   0–50   avg customer rating / 5 × 50 (0 with no ratings)
//   fulfilment component 0–50  share of fulfilled orders that were on time × 50
//   − complaint penalty  up to −24  every open complaint about the supplier: −8
//   − dispute penalty    up to −20  every dispute resolved with a refund: −10
//   − fraud penalty      up to −30  every unreviewed HIGH fraud flag: −15
//
// Customer trust (0–100):
//   starts at a neutral 60
//   + paid-orders bonus  up to +20    every paid order: +5
//   − cancellation penalty up to −25   every cancelled request: −5
//   − refund penalty     up to −30     every full refund: −10
//   − open dispute penalty up to −30   every OPEN/IN_REVIEW dispute: −15
//   − fraud penalty      up to −40     every unreviewed HIGH fraud flag: −20
import { prisma } from "@/lib/prisma";
import { supplierRatingSummary } from "@/lib/trust/ratings";
import { FRAUD_FLAG_STATUS } from "@/lib/trust/types";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function bandFor(score: number): string {
  if (score >= 85) return "EXCELLENT";
  if (score >= 70) return "GOOD";
  if (score >= 50) return "FAIR";
  if (score >= 35) return "WATCH";
  return "CAUTION";
}

export async function supplierReliability(supplierId: string) {
  const summary = await supplierRatingSummary(supplierId);

  const fulfilled = await prisma.supplierRequest.findMany({
    where: {
      supplierId,
      request: { status: { in: ["DELIVERED", "COMPLETED"] } },
    },
    select: {
      fulfilledAt: true,
      request: { select: { deliveryDeadline: true } },
    },
  });

  const total = fulfilled.length;
  const onTime = fulfilled.filter(
    (row) =>
      row.fulfilledAt &&
      (!row.request.deliveryDeadline || row.fulfilledAt <= row.request.deliveryDeadline),
  ).length;

  const ratingsComponent =
    summary.count > 0 && summary.average !== null
      ? (summary.average / 5) * 50
      : 0;
  const fulfilmentComponent = total > 0 ? 50 * (onTime / total) : 0;

  const openComplaints = await prisma.complaint.count({
    where: {
      subjectType: "SUPPLIER",
      subjectId: supplierId,
      status: { not: "RESOLVED" },
    },
  });
  const refundDisputes = await prisma.dispute.count({
    where: {
      status: "RESOLVED_REFUND",
      request: { supplierAssignments: { some: { supplierId } } },
    },
  });
  const unreviewedHighFlags = await prisma.fraudFlag.count({
    where: {
      subjectType: "SUPPLIER",
      subjectId: supplierId,
      severity: "HIGH",
      status: { in: [FRAUD_FLAG_STATUS.FLAGGED, FRAUD_FLAG_STATUS.REVIEWED] },
    },
  });

  const complaintPenalty = Math.min(openComplaints, 3) * 8;
  const disputePenalty = Math.min(refundDisputes, 2) * 10;
  const fraudPenalty = Math.min(unreviewedHighFlags, 2) * 15;

  const score = clampScore(
    ratingsComponent + fulfilmentComponent - complaintPenalty - disputePenalty - fraudPenalty,
  );

  return {
    score,
    band: bandFor(score),
    components: {
      ratingAverage: summary.average,
      ratingCount: summary.count,
      onTimeRatio: total > 0 ? Math.round((onTime / total) * 100) : null,
      fulfilledOrders: total,
      complaintPenalty,
      disputePenalty,
      fraudPenalty,
    },
  };
}

export async function customerTrust(userId: string) {
  const paidOrders = await prisma.payment.count({
    where: { customerId: userId, status: { in: ["PAID", "REFUNDED"] } },
  });
  const cancelled = await prisma.request.count({
    where: { customerId: userId, status: "CANCELLED" },
  });
  const refunds = await prisma.refund.count({
    where: { payment: { customerId: userId } },
  });
  const openDisputes = await prisma.dispute.count({
    where: { raisedById: userId, status: { in: ["OPEN", "IN_REVIEW"] } },
  });
  const unreviewedHighFlags = await prisma.fraudFlag.count({
    where: {
      subjectType: "CUSTOMER",
      subjectId: userId,
      severity: "HIGH",
      status: { in: [FRAUD_FLAG_STATUS.FLAGGED, FRAUD_FLAG_STATUS.REVIEWED] },
    },
  });

  const paidBonus = Math.min(paidOrders, 4) * 5;
  const cancellationPenalty = Math.min(cancelled, 5) * 5;
  const refundPenalty = Math.min(refunds, 3) * 10;
  const disputePenalty = Math.min(openDisputes, 2) * 15;
  const fraudPenalty = Math.min(unreviewedHighFlags, 2) * 20;

  const score = clampScore(
    60 + paidBonus - cancellationPenalty - refundPenalty - disputePenalty - fraudPenalty,
  );

  return {
    score,
    band: bandFor(score),
    components: {
      paidOrders,
      paidBonus,
      cancelled,
      cancellationPenalty,
      refunds,
      refundPenalty,
      openDisputes,
      disputePenalty,
      unreviewedHighFlags,
      fraudPenalty,
    },
  };
}