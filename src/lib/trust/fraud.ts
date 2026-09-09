// Phase 11 — deterministic fraud signals. Every signal below is computed from
// stored platform data (counts of disputes, refunds, cancellations, abandoned
// checkouts, unfulfilled assignments) — never from a client's claim about
// itself. Signals are recorded as FraudFlag rows (deduped by a unique key) and
// surfaced to admins, who review and clear them manually.
import { prisma } from "@/lib/prisma";
import {
  FRAUD_SIGNALS,
  TrustError,
  type FraudSeverity,
  type FraudSignalCode,
} from "@/lib/trust/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FraudSignalMatch {
  signal: FraudSignalCode;
  severity: FraudSeverity;
  detail: string;
}

export function evaluateSignals(
  subjectType: string,
  subjectId: string,
  counts: Record<string, number>,
): FraudSignalMatch[] {
  if (subjectType === "CUSTOMER") {
    return customerSignals(subjectId, counts);
  }
  if (subjectType === "SUPPLIER") {
    return supplierSignals(counts);
  }
  return [];
}

function customerSignals(subjectId: string, c: Record<string, number>): FraudSignalMatch[] {
  const matches: FraudSignalMatch[] = [];

  const openDisputes = c.openDisputes ?? 0;
  if (openDisputes >= 2) {
    matches.push({
      signal: "CUSTOMER_MULTIPLE_OPEN_DISPUTES",
      severity: openDisputes >= 4 ? "HIGH" : "MEDIUM",
      detail: `${openDisputes} open dispute${openDisputes === 1 ? "" : "s"} for customer ${subjectId}.`,
    });
  }

  const refunds = c.recentRefunds ?? 0;
  if (refunds >= 2) {
    matches.push({
      signal: "CUSTOMER_REPEATED_REFUNDS",
      severity: refunds >= 4 ? "HIGH" : "MEDIUM",
      detail: `${refunds} full refund${refunds === 1 ? "" : "s"} in the last 30 days for customer ${subjectId}.`,
    });
  }

  const cancellations = c.recentCancellations ?? 0;
  if (cancellations >= 3) {
    matches.push({
      signal: "CUSTOMER_MULTIPLE_CANCELLATIONS",
      severity: cancellations >= 6 ? "MEDIUM" : "LOW",
      detail: `${cancellations} cancelled request${cancellations === 1 ? "" : "s"} in the last 7 days for customer ${subjectId}.`,
    });
  }

  const abandoned = c.abandonedCheckouts ?? 0;
  if (abandoned >= 2) {
    matches.push({
      signal: "CUSTOMER_UNPAID_ABANDONED_CHECKOUTS",
      severity: abandoned >= 4 ? "MEDIUM" : "LOW",
      detail: `${abandoned} unpaid checkout${abandoned === 1 ? "" : "s"} older than 7 days for customer ${subjectId}.`,
    });
  }

  return matches;
}

function supplierSignals(c: Record<string, number>): FraudSignalMatch[] {
  const matches: FraudSignalMatch[] = [];

  const disputed = c.refundDisputes ?? 0;
  if (disputed >= 2) {
    matches.push({
      signal: "SUPPLIER_MULTIPLE_REFUND_DISPUTES",
      severity: disputed >= 4 ? "HIGH" : "MEDIUM",
      detail: `${disputed} fulfilled order${disputed === 1 ? "" : "s"} refunded after a dispute.`,
    });
  }

  const complaints = c.openComplaints ?? 0;
  if (complaints >= 2) {
    matches.push({
      signal: "SUPPLIER_REPEATED_COMPLAINTS",
      severity: complaints >= 4 ? "MEDIUM" : "LOW",
      detail: `${complaints} open complaint${complaints === 1 ? "" : "s"} against this supplier.`,
    });
  }

  const unfulfilled = c.unfulfilledOrders ?? 0;
  if (unfulfilled >= 3) {
    matches.push({
      signal: "SUPPLIER_UNFULFILLED_ORDERS",
      severity: unfulfilled >= 6 ? "MEDIUM" : "LOW",
      detail: `${unfulfilled} assignment${unfulfilled === 1 ? "" : "s"} unfulfilled for more than 14 days.`,
    });
  }

  return matches;
}

// Computes the raw counts used by the deterministic signal rules.
async function loadCounts(
  subjectType: string,
  subjectId: string,
): Promise<Record<string, number>> {
  const now = Date.now();
  const counts: Record<string, number> = {};

  if (subjectType === "CUSTOMER") {
    counts.openDisputes = await prisma.dispute.count({
      where: { raisedById: subjectId, status: { in: ["OPEN", "IN_REVIEW"] } },
    });
    counts.recentRefunds = await prisma.refund.count({
      where: {
        createdAt: { gte: new Date(now - 30 * DAY_MS) },
        payment: { customerId: subjectId },
      },
    });
    counts.recentCancellations = await prisma.request.count({
      where: {
        customerId: subjectId,
        status: "CANCELLED",
        updatedAt: { gte: new Date(now - 7 * DAY_MS) },
      },
    });
    counts.abandonedCheckouts = await prisma.payment.count({
      where: {
        customerId: subjectId,
        status: "PENDING",
        createdAt: { lt: new Date(now - 7 * DAY_MS) },
      },
    });
  }

  if (subjectType === "SUPPLIER") {
    counts.refundDisputes = await prisma.dispute.count({
      where: {
        status: "RESOLVED_REFUND",
        request: { supplierAssignments: { some: { supplierId: subjectId } } },
      },
    });
    counts.openComplaints = await prisma.complaint.count({
      where: {
        subjectType: "SUPPLIER",
        subjectId,
        status: { not: "RESOLVED" },
      },
    });
    counts.unfulfilledOrders = await prisma.supplierRequest.count({
      where: {
        supplierId: subjectId,
        status: { in: ["ASSIGNED", "ACCEPTED"] },
        request: {
          status: { in: ["FULFILLMENT_PENDING", "PROCESSING"] },
          updatedAt: { lt: new Date(now - 14 * DAY_MS) },
        },
      },
    });
  }

  return counts;
}

// Records one FraudFlag row per newly-triggered signal. Existing rows for the
// same (subjectType, subjectId, signal) are left untouched — flags are never
// silently downgraded or deleted, only reviewed/cleared by an admin.
export async function recordFraudFlags(
  subjectType: string,
  subjectId: string,
): Promise<{ created: number }> {
  const counts = await loadCounts(subjectType, subjectId);
  const matches = evaluateSignals(subjectType, subjectId, counts);

  let created = 0;
  for (const match of matches) {
    const existing = await prisma.fraudFlag.findUnique({
      where: {
        subjectType_subjectId_signal: {
          subjectType,
          subjectId,
          signal: match.signal,
        },
      },
      select: { id: true },
    });
    if (existing) {
      continue;
    }
    await prisma.fraudFlag.create({
      data: {
        reference: nextFlagReference(),
        subjectType,
        subjectId,
        signal: match.signal,
        severity: match.severity,
        detail: match.detail,
        status: "FLAGGED",
      },
    });
    created += 1;
  }
  return { created };
}

export function signalLabel(signal: string): string {
  return (FRAUD_SIGNALS as Record<string, { label: string }>)[signal]?.label ?? signal;
}

export async function listFraudFlags(input: { status?: string; limit?: number } = {}) {
  return prisma.fraudFlag.findMany({
    where: input.status ? { status: input.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 50,
    include: {
      request: {
        select: { reference: true, summary: true, status: true },
      },
    },
  });
}

export async function getFraudFlag(id: string) {
  return prisma.fraudFlag.findUnique({
    where: { id },
    include: {
      request: {
        select: { reference: true, summary: true, status: true },
      },
    },
  });
}

export async function reviewFraudFlag(input: {
  flagId: string;
  adminUserId: string;
  status: string; // REVIEWED | CLEARED
  note?: string;
}) {
  const flag = await prisma.fraudFlag.findUnique({
    where: { id: input.flagId },
    select: { id: true, status: true },
  });
  if (!flag) {
    throw new TrustError("NOT_FOUND", "Flag not found.");
  }
  if (!["REVIEWED", "CLEARED"].includes(input.status)) {
    throw new TrustError("INVALID_STATUS", "Invalid review status.");
  }
  return prisma.fraudFlag.update({
    where: { id: input.flagId },
    data: {
      status: input.status,
      reviewedById: input.adminUserId,
      note: input.note?.trim() || null,
      resolvedAt: new Date(),
    },
  });
}

let flagCounter = 0;
function nextFlagReference(): string {
  const time = Date.now().toString(36).toUpperCase();
  flagCounter += 1;
  return `FLG-${time}${flagCounter.toString(36).toUpperCase().padStart(4, "0")}`;
}