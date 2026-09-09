// Phase 11 — API views for ratings, disputes, complaints, fraud flags,
// trust scores and transaction history. Money is emitted in naira (converted
// from kobo) for display; kobo remains the storage + computation unit.
import { majorUnitsFromMinor } from "@/lib/money";
import {
  DISPUTE_STATUS_LABELS,
  COMPLAINT_STATUS_LABELS,
  FRAUD_FLAG_STATUS_LABELS,
  DISPUTE_REASON_LABELS,
} from "@/lib/trust/types";
import { signalLabel } from "@/lib/trust/fraud";
import type { LedgerRow } from "@/lib/trust/history";

export interface RatingView {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RatableSupplierView {
  id: string;
  businessName: string;
  rating: RatingView | null;
}

export function serializeRating(row: {
  id: string;
  score: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RatingView {
  return {
    id: row.id,
    score: row.score,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface DisputeView {
  id: string;
  reference: string;
  requestId: string;
  requestReference: string;
  requestSummary: string;
  requestStatus: string;
  raisedById: string;
  raisedByRole: string;
  reason: string;
  reasonLabel: string;
  description: string;
  expectedResolution: string | null;
  status: string;
  statusLabel: string;
  resolutionNote: string | null;
  refundReference: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: string; name: string; email: string } | null;
}

export function serializeDispute(row: {
  id: string;
  reference: string;
  requestId: string;
  raisedById: string;
  raisedByRole: string;
  reason: string;
  description: string;
  expectedResolution: string | null;
  status: string;
  resolutionNote: string | null;
  refundReference: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  request: {
    reference: string;
    summary: string;
    status: string;
    customer?: { id: string; name: string; email: string } | null;
  };
}): DisputeView {
  return {
    id: row.id,
    reference: row.reference,
    requestId: row.requestId,
    requestReference: row.request.reference,
    requestSummary: row.request.summary,
    requestStatus: row.request.status,
    raisedById: row.raisedById,
    raisedByRole: row.raisedByRole,
    reason: row.reason,
    reasonLabel: DISPUTE_REASON_LABELS[row.reason as keyof typeof DISPUTE_REASON_LABELS] ?? row.reason,
    description: row.description,
    expectedResolution: row.expectedResolution,
    status: row.status,
    statusLabel: DISPUTE_STATUS_LABELS[row.status as keyof typeof DISPUTE_STATUS_LABELS] ?? row.status,
    resolutionNote: row.resolutionNote,
    refundReference: row.refundReference,
    resolvedById: row.resolvedById,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    customer: row.request.customer ?? null,
  };
}

export interface ComplaintView {
  id: string;
  reference: string;
  subjectType: string;
  subjectId: string;
  requestId: string | null;
  requestReference: string | null;
  requestSummary: string | null;
  raisedById: string;
  category: string;
  description: string;
  status: string;
  statusLabel: string;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeComplaint(row: {
  id: string;
  reference: string;
  subjectType: string;
  subjectId: string;
  requestId: string | null;
  raisedById: string;
  category: string;
  description: string;
  status: string;
  resolution: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  request?: { reference: string; summary: string; status: string } | null;
}): ComplaintView {
  return {
    id: row.id,
    reference: row.reference,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    requestId: row.requestId,
    requestReference: row.request?.reference ?? null,
    requestSummary: row.request?.summary ?? null,
    raisedById: row.raisedById,
    category: row.category,
    description: row.description,
    status: row.status,
    statusLabel: COMPLAINT_STATUS_LABELS[row.status] ?? row.status,
    resolution: row.resolution,
    resolvedById: row.resolvedById,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface FraudFlagView {
  id: string;
  reference: string;
  subjectType: string;
  subjectId: string;
  requestId: string | null;
  requestReference: string | null;
  signal: string;
  signalLabel: string;
  severity: string;
  detail: string;
  status: string;
  statusLabel: string;
  reviewedById: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function serializeFraudFlag(row: {
  id: string;
  reference: string;
  subjectType: string;
  subjectId: string;
  requestId: string | null;
  signal: string;
  severity: string;
  detail: string;
  status: string;
  reviewedById: string | null;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  request?: { reference: string; summary: string; status: string } | null;
}): FraudFlagView {
  return {
    id: row.id,
    reference: row.reference,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    requestId: row.requestId,
    requestReference: row.request?.reference ?? null,
    signal: row.signal,
    signalLabel: signalLabel(row.signal),
    severity: row.severity,
    detail: row.detail,
    status: row.status,
    statusLabel: FRAUD_FLAG_STATUS_LABELS[row.status] ?? row.status,
    reviewedById: row.reviewedById,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export interface LedgerEntryView {
  id: string;
  type: "CHARGE" | "REFUND" | "EARNING";
  reference: string;
  amountNaira: number;
  currency: string;
  status: string;
  occurredAt: string;
  requestReference: string;
  requestSummary: string;
}

export function serializeLedgerEntry(row: LedgerRow): LedgerEntryView {
  return {
    id: row.id,
    type: row.type,
    reference: row.reference,
    amountNaira: majorUnitsFromMinor(row.amountKobo),
    currency: row.currency,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    requestReference: row.requestReference,
    requestSummary: row.requestSummary,
  };
}