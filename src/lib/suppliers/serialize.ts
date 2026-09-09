import { majorUnitsFromMinor } from "@/lib/money";
import { categoryLabel } from "@/lib/requests/categories";
import { supplierStatusLabel, supplierRequestStatusLabel } from "./status";

// ─── Domain types ────────────────────────────────────────────────────────────

export type SupplierProfileOutput = {
  id: string;
  userId: string;
  businessName: string;
  description: string | null;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  categories: string[];
  categoryLabels: string[];
  serviceArea: string | null;
  operatingHours: string | null;
  paymentDetails: string | null;
  logoUrl: string | null;
  status: string;
  statusLabel: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierOfferingOutput = {
  id: string;
  category: string;
  categoryLabel: string;
  title: string;
  description: string | null;
  priceNaira: number | null;
  currency: string;
  availability: string | null;
  location: string | null;
  deliveryDetail: string | null;
  images: string[];
  isActive: boolean;
  quantityAvailable: number | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierRequestOutput = {
  id: string;
  requestId: string;
  reference: string;
  summary: string;
  categoryLabel: string;
  status: string;
  statusLabel: string;
  earnedNaira: number | null;
  fulfilledAt: string | null;
  notes: string | null;
  overrideNote: string | null;
  createdAt: string;
};

export type SupplierEarningOutput = {
  id: string;
  requestId: string;
  reference: string;
  summary: string;
  amountNaira: number;
  reason: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

// ─── Row shapes (subset of Prisma return types) ──────────────────────────────

type SupplierRow = {
  id: string;
  userId: string;
  businessName: string;
  description: string | null;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  supplierCategories: Array<{ categoryKey: string }>;
  serviceArea: string | null;
  operatingHours: string | null;
  paymentDetails: string | null;
  logoUrl: string | null;
  status: string;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type OfferingRow = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  priceKobo: number | null;
  currency: string;
  availability: string | null;
  location: string | null;
  deliveryDetail: string | null;
  images: string;
  isActive: boolean;
  quantityAvailable: number | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SupplierRequestRow = {
  id: string;
  requestId: string;
  status: string;
  earnedKobo: number | null;
  fulfilledAt: Date | null;
  notes: string | null;
  overrideNote: string | null;
  createdAt: Date;
  request: {
    id: string;
    reference: string;
    summary: string;
    category: string;
  };
};

type EarningRow = {
  id: string;
  requestId: string;
  amountKobo: number;
  reason: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  request: {
    reference: string;
    summary: string;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseImages(encoded: string): string[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

// ─── Serializers ─────────────────────────────────────────────────────────────

export function serializeSupplierProfile(row: SupplierRow): SupplierProfileOutput {
  const categories = row.supplierCategories.map((c) => c.categoryKey);
  return {
    id: row.id,
    userId: row.userId,
    businessName: row.businessName,
    description: row.description,
    contactName: row.contactName,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    categories,
    categoryLabels: categories.map((c) => categoryLabel(c)),
    serviceArea: row.serviceArea,
    operatingHours: row.operatingHours,
    paymentDetails: row.paymentDetails,
    logoUrl: row.logoUrl,
    status: row.status,
    statusLabel: supplierStatusLabel(row.status),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeSupplierOffering(row: OfferingRow): SupplierOfferingOutput {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    title: row.title,
    description: row.description,
    priceNaira: row.priceKobo === null ? null : majorUnitsFromMinor(row.priceKobo),
    currency: row.currency,
    availability: row.availability,
    location: row.location,
    deliveryDetail: row.deliveryDetail,
    images: parseImages(row.images),
    isActive: row.isActive,
    quantityAvailable: row.quantityAvailable,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeSupplierRequest(row: SupplierRequestRow): SupplierRequestOutput {
  return {
    id: row.id,
    requestId: row.requestId,
    reference: row.request.reference,
    summary: row.request.summary,
    categoryLabel: categoryLabel(row.request.category),
    status: row.status,
    statusLabel: supplierRequestStatusLabel(row.status),
    earnedNaira: row.earnedKobo === null ? null : majorUnitsFromMinor(row.earnedKobo),
    fulfilledAt: row.fulfilledAt ? row.fulfilledAt.toISOString() : null,
    notes: row.notes,
    overrideNote: row.overrideNote,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeSupplierEarning(row: EarningRow): SupplierEarningOutput {
  return {
    id: row.id,
    requestId: row.requestId,
    reference: row.request.reference,
    summary: row.request.summary,
    amountNaira: majorUnitsFromMinor(row.amountKobo),
    reason: row.reason,
    status: row.status,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
