// Phase 11 — transaction history. One view entitled to the money trail of the
// platform, assembled from existing ledger rows (payments/changes, refunds,
// supplier earnings). All amounts stay in minor units (kobo); nothing here
// creates or mutates money.
import { prisma } from "@/lib/prisma";

export interface LedgerRow {
  id: string;
  type: "CHARGE" | "REFUND" | "EARNING";
  reference: string;
  amountKobo: number;
  currency: string;
  status: string;
  occurredAt: Date;
  requestReference: string;
  requestSummary: string;
}

// The full history of a single customer: their charges and their refunds.
export async function customerTransactionHistory(
  userId: string,
): Promise<LedgerRow[]> {
  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
      include: { request: { select: { reference: true, summary: true } } },
    }),
    prisma.refund.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          include: {
            request: { select: { reference: true, summary: true } },
          },
        },
      },
      where: {
        payment: { customerId: userId },
      },
    }),
  ]);

  const rows: LedgerRow[] = [
    ...payments.map((payment) => ({
      id: payment.id,
      type: "CHARGE" as const,
      reference: payment.reference,
      amountKobo: payment.amountKobo,
      currency: payment.currency,
      status: payment.status,
      occurredAt: payment.paidAt ?? payment.createdAt,
      requestReference: payment.request.reference,
      requestSummary: payment.request.summary,
    })),
    ...refunds.map((refund) => ({
      id: refund.id,
      type: "REFUND" as const,
      reference: refund.reference,
      amountKobo: refund.amountKobo,
      currency: "NGN",
      status: refund.status,
      occurredAt: refund.createdAt,
      requestReference: refund.payment.request.reference,
      requestSummary: refund.payment.request.summary,
    })),
  ];

  return rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

// A supplier's earnings history (money owed/paid for fulfilled orders).
export async function supplierTransactionHistory(
  supplierId: string,
): Promise<LedgerRow[]> {
  const earnings = await prisma.supplierEarning.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
    include: { request: { select: { reference: true, summary: true } } },
  });

  return earnings.map((earning) => ({
    id: earning.id,
    type: "EARNING" as const,
    reference: earning.id,
    amountKobo: earning.amountKobo,
    currency: "NGN",
    status: earning.status,
    occurredAt: earning.paidAt ?? earning.createdAt,
    requestReference: earning.request.reference,
    requestSummary: earning.request.summary,
  }));
}

// The whole platform ledger: charges + refunds + earnings, newest first.
export async function platformLedger(limit = 100): Promise<LedgerRow[]> {
  const [payments, refunds, earnings] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { request: { select: { reference: true, summary: true } } },
    }),
    prisma.refund.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payment: {
          include: {
            request: { select: { reference: true, summary: true } },
          },
        },
      },
    }),
    prisma.supplierEarning.findMany({
      orderBy: { createdAt: "desc" },
      include: { request: { select: { reference: true, summary: true } } },
    }),
  ]);

  const rows: LedgerRow[] = [
    ...payments.map((payment) => ({
      id: payment.id,
      type: "CHARGE" as const,
      reference: payment.reference,
      amountKobo: payment.amountKobo,
      currency: payment.currency,
      status: payment.status,
      occurredAt: payment.paidAt ?? payment.createdAt,
      requestReference: payment.request.reference,
      requestSummary: payment.request.summary,
    })),
    ...refunds.map((refund) => ({
      id: refund.id,
      type: "REFUND" as const,
      reference: refund.reference,
      amountKobo: refund.amountKobo,
      currency: "NGN",
      status: refund.status,
      occurredAt: refund.createdAt,
      requestReference: refund.payment.request.reference,
      requestSummary: refund.payment.request.summary,
    })),
    ...earnings.map((earning) => ({
      id: earning.id,
      type: "EARNING" as const,
      reference: earning.id,
      amountKobo: earning.amountKobo,
      currency: "NGN",
      status: earning.status,
      occurredAt: earning.paidAt ?? earning.createdAt,
      requestReference: earning.request.reference,
      requestSummary: earning.request.summary,
    })),
  ];

  return rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, limit);
}