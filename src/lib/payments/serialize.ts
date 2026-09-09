import { majorUnitsFromMinor } from "@/lib/money";
import { paymentStatusLabel } from "@/lib/payments/status";

export interface PaymentTransactionView {
  id: string;
  type: string; // CHARGE | REFUND
  status: string; // SUCCEEDED | FAILED
  amountNaira: number;
  reference: string;
  providerReference: string | null;
  createdAt: string;
}

export interface PaymentRefundView {
  id: string;
  amountNaira: number;
  reason: string | null;
  reference: string;
  createdAt: string;
}

// Customer-facing payment summary. Deliberately omits the checkout token and
// the provider's internal reference from non-init responses.
export interface PaymentView {
  id: string;
  requestId: string;
  reference: string;
  provider: string;
  amountNaira: number;
  currency: string;
  status: string;
  statusLabel: string;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

// Operations-facing payment detail: full ledger + refund trail.
export interface OperationPaymentOutput extends PaymentView {
  providerReference: string;
  providerStatus: string | null;
  transactions: PaymentTransactionView[];
  refunds: PaymentRefundView[];
}

type TransactionRow = {
  id: string;
  type: string;
  status: string;
  amountKobo: number;
  reference: string;
  providerReference: string | null;
  createdAt: Date;
};

type RefundRow = {
  id: string;
  amountKobo: number;
  reason: string | null;
  reference: string;
  createdAt: Date;
};

type PaymentRow = {
  id: string;
  requestId: string;
  reference: string;
  provider: string;
  providerReference: string;
  amountKobo: number;
  currency: string;
  status: string;
  providerStatus: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  transactions?: TransactionRow[];
  refunds?: RefundRow[];
};

export type { PaymentRow, TransactionRow, RefundRow };

export function serializePayment(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    requestId: row.requestId,
    reference: row.reference,
    provider: row.provider,
    amountNaira: majorUnitsFromMinor(row.amountKobo),
    currency: row.currency,
    status: row.status,
    statusLabel: paymentStatusLabel(row.status),
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeOperationPayment(row: PaymentRow): OperationPaymentOutput {
  return {
    ...serializePayment(row),
    providerReference: row.providerReference,
    providerStatus: row.providerStatus,
    transactions: (row.transactions ?? []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amountNaira: majorUnitsFromMinor(tx.amountKobo),
      reference: tx.reference,
      providerReference: tx.providerReference,
      createdAt: tx.createdAt.toISOString(),
    })),
    refunds: (row.refunds ?? []).map((refund) => ({
      id: refund.id,
      amountNaira: majorUnitsFromMinor(refund.amountKobo),
      reason: refund.reason,
      reference: refund.reference,
      createdAt: refund.createdAt.toISOString(),
    })),
  };
}