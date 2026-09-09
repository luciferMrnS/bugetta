export const SUPPLIER_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;

export type SupplierStatus = (typeof SUPPLIER_STATUS)[keyof typeof SUPPLIER_STATUS];

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

export const SUPPLIER_REQUEST_STATUS = {
  ASSIGNED: "ASSIGNED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
} as const;

export type SupplierRequestStatus =
  (typeof SUPPLIER_REQUEST_STATUS)[keyof typeof SUPPLIER_REQUEST_STATUS];

export const SUPPLIER_REQUEST_STATUS_LABELS: Record<SupplierRequestStatus, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
};

export function supplierStatusLabel(status: string): string {
  return SUPPLIER_STATUS_LABELS[status as SupplierStatus] ?? status;
}

export function supplierRequestStatusLabel(status: string): string {
  return SUPPLIER_REQUEST_STATUS_LABELS[status as SupplierRequestStatus] ?? status;
}
