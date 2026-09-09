import { prisma } from "@/lib/prisma";
import { minorUnitsFromMajor, majorUnitsFromMinor } from "@/lib/money";
import { SUPPLIER_STATUS } from "./status";
import {
  serializeSupplierProfile,
  serializeSupplierOffering,
  serializeSupplierRequest,
  serializeSupplierEarning,
  type SupplierProfileOutput,
  type SupplierOfferingOutput,
  type SupplierRequestOutput,
  type SupplierEarningOutput,
} from "./serialize";
import type { OfferingInput } from "../validators/supplier";
import { CATEGORIES } from "../requests/categories";

const CATEGORY_KEYS: string[] = Object.values(CATEGORIES);

const SUPPLIER_CATEGORY_INCLUDE = {
  supplierCategories: { select: { categoryKey: true } },
} as const;

export class SupplierError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function registerSupplier(userId: string, data: {
  businessName: string;
  description?: string;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  categories?: string[];
  serviceArea?: string;
  operatingHours?: string;
  paymentDetails?: string;
  logoUrl?: string;
}): Promise<SupplierProfileOutput> {
  const existing = await prisma.supplier.findUnique({ where: { userId }, select: { id: true } });
  if (existing) {
    throw new SupplierError("ALREADY_REGISTERED", "You are already registered as a supplier.");
  }

  const validCategories = (data.categories ?? []).filter((c) =>
    CATEGORY_KEYS.includes(c),
  );

  const supplier = await prisma.supplier.create({
    data: {
      userId,
      businessName: data.businessName.trim(),
      description: data.description?.trim() || null,
      contactName: data.contactName?.trim() || "",
      phone: data.phone?.trim() || null,
      whatsapp: data.whatsapp?.trim() || null,
      email: data.email?.trim() || null,
      supplierCategories: {
        create: validCategories.map((categoryKey) => ({ categoryKey })),
      },
      serviceArea: data.serviceArea?.trim() || null,
      operatingHours: data.operatingHours?.trim() || null,
      paymentDetails: data.paymentDetails?.trim() || null,
      logoUrl: data.logoUrl?.trim() || null,
      status: SUPPLIER_STATUS.PENDING,
    },
    include: SUPPLIER_CATEGORY_INCLUDE,
  });

  return serializeSupplierProfile(supplier);
}

export async function getSupplierProfile(userId: string): Promise<SupplierProfileOutput | null> {
  const row = await prisma.supplier.findUnique({
    where: { userId },
    include: SUPPLIER_CATEGORY_INCLUDE,
  });
  return row ? serializeSupplierProfile(row) : null;
}

export async function updateSupplierProfile(userId: string, data: {
  businessName?: string;
  description?: string;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  categories?: string[];
  serviceArea?: string;
  operatingHours?: string;
  paymentDetails?: string;
  logoUrl?: string;
}): Promise<SupplierProfileOutput> {
  const existing = await prisma.supplier.findUnique({ where: { userId }, select: { id: true } });
  if (!existing) {
    throw new SupplierError("NOT_FOUND", "Supplier profile not found.");
  }

  const validCategories = (data.categories ?? []).filter((c) =>
    CATEGORY_KEYS.includes(c),
  );

  const updated = await prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.update({
      where: { userId },
      data: {
        ...(data.businessName !== undefined && { businessName: data.businessName.trim() }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.contactName !== undefined && { contactName: data.contactName?.trim() || "" }),
        ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp?.trim() || null }),
        ...(data.email !== undefined && { email: data.email?.trim() || null }),
        ...(data.serviceArea !== undefined && { serviceArea: data.serviceArea?.trim() || null }),
        ...(data.operatingHours !== undefined && { operatingHours: data.operatingHours?.trim() || null }),
        ...(data.paymentDetails !== undefined && { paymentDetails: data.paymentDetails?.trim() || null }),
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl?.trim() || null }),
      },
    });
    if (data.categories !== undefined) {
      await tx.supplierCategory.deleteMany({ where: { supplierId: supplier.id } });
      if (validCategories.length > 0) {
        await tx.supplierCategory.createMany({
          data: validCategories.map((categoryKey) => ({
            supplierId: supplier.id,
            categoryKey,
          })),
        });
      }
    }
    return tx.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
      include: SUPPLIER_CATEGORY_INCLUDE,
    });
  });

  return serializeSupplierProfile(updated);
}

// ─── Admin supplier review ──────────────────────────────────────────────────

export async function listPendingSuppliers(): Promise<SupplierProfileOutput[]> {
  const rows = await prisma.supplier.findMany({
    where: { status: SUPPLIER_STATUS.PENDING },
    orderBy: { createdAt: "desc" },
    include: SUPPLIER_CATEGORY_INCLUDE,
  });
  return rows.map(serializeSupplierProfile);
}

export async function listAllSuppliers(): Promise<SupplierProfileOutput[]> {
  const rows = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
    include: SUPPLIER_CATEGORY_INCLUDE,
  });
  return rows.map(serializeSupplierProfile);
}

export async function reviewSupplier(supplierId: string, action: "approve" | "reject" | "suspend"): Promise<SupplierProfileOutput> {
  const existing = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!existing) {
    throw new SupplierError("NOT_FOUND", "Supplier not found.");
  }

  const now = new Date();
  const updateData: Partial<{ status: string; approvedAt: Date | null; rejectedAt: Date | null }> = {};

  if (action === "approve") {
    updateData.status = SUPPLIER_STATUS.APPROVED;
    updateData.approvedAt = now;
    updateData.rejectedAt = null;
  } else if (action === "reject") {
    updateData.status = SUPPLIER_STATUS.REJECTED;
    updateData.rejectedAt = now;
    updateData.approvedAt = null;
  } else {
    updateData.status = SUPPLIER_STATUS.SUSPENDED;
  }

  const updated = await prisma.supplier.update({
    where: { id: supplierId },
    data: updateData,
    include: SUPPLIER_CATEGORY_INCLUDE,
  });

  return serializeSupplierProfile(updated);
}

// ─── Offerings ──────────────────────────────────────────────────────────────

export async function listSupplierOfferings(supplierId: string): Promise<SupplierOfferingOutput[]> {
  const rows = await prisma.offering.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeSupplierOffering);
}

export async function createOffering(supplierId: string, input: OfferingInput): Promise<SupplierOfferingOutput> {
  const validCategory = CATEGORY_KEYS.includes(input.category);
  if (!validCategory) {
    throw new SupplierError("INVALID_CATEGORY", "Invalid category.");
  }

  const priceKobo =
    typeof input.priceNaira === "number" && Number.isFinite(input.priceNaira)
      ? minorUnitsFromMajor(input.priceNaira)
      : null;

  const offering = await prisma.offering.create({
    data: {
      supplierId,
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priceKobo,
      currency: input.currency,
      availability: input.availability?.trim() || null,
      location: input.location?.trim() || null,
      deliveryDetail: input.deliveryDetail?.trim() || null,
      images: JSON.stringify(Array.isArray(input.images) ? input.images : []),
      isActive: input.isActive,
      quantityAvailable:
        typeof input.quantityAvailable === "number" && Number.isFinite(input.quantityAvailable)
          ? input.quantityAvailable
          : null,
      lastSyncedAt:
        typeof input.quantityAvailable === "number" && Number.isFinite(input.quantityAvailable)
          ? new Date()
          : null,
    },
  });

  return serializeSupplierOffering(offering);
}

export async function updateOffering(
  supplierId: string,
  offeringId: string,
  input: Partial<OfferingInput>,
): Promise<SupplierOfferingOutput> {
  const existing = await prisma.offering.findUnique({ where: { id: offeringId } });
  if (!existing || existing.supplierId !== supplierId) {
    throw new SupplierError("NOT_FOUND", "Offering not found.");
  }

  const updateData: Record<string, unknown> = {};
  if (input.category !== undefined) {
    if (!CATEGORY_KEYS.includes(input.category)) {
      throw new SupplierError("INVALID_CATEGORY", "Invalid category.");
    }
    updateData.category = input.category;
  }
  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.priceNaira !== undefined) {
    updateData.priceKobo =
      typeof input.priceNaira === "number" && Number.isFinite(input.priceNaira)
        ? minorUnitsFromMajor(input.priceNaira)
        : null;
  }
  if (input.availability !== undefined) updateData.availability = input.availability?.trim() || null;
  if (input.location !== undefined) updateData.location = input.location?.trim() || null;
  if (input.deliveryDetail !== undefined) updateData.deliveryDetail = input.deliveryDetail?.trim() || null;
  if (input.images !== undefined) updateData.images = JSON.stringify(input.images);
  if (input.isActive !== undefined) updateData.isActive = input.isActive;
  if (input.quantityAvailable !== undefined) {
    updateData.quantityAvailable =
      typeof input.quantityAvailable === "number" && Number.isFinite(input.quantityAvailable)
        ? input.quantityAvailable
        : null;
    updateData.lastSyncedAt = new Date();
  }

  const updated = await prisma.offering.update({
    where: { id: offeringId },
    data: updateData,
  });

  return serializeSupplierOffering(updated);
}

export async function deleteOffering(supplierId: string, offeringId: string): Promise<void> {
  const existing = await prisma.offering.findUnique({ where: { id: offeringId } });
  if (!existing || existing.supplierId !== supplierId) {
    throw new SupplierError("NOT_FOUND", "Offering not found.");
  }
  await prisma.offering.delete({ where: { id: offeringId } });
}

// ─── Requests (inbound opportunities) ───────────────────────────────────────

/**
 * Requests where the customer has received and accepted a quote, an operations
 * agent has assigned the supplier, and the supplier may act on them.
 */
const ASSIGNED_REQUESTS_INCLUDE = {
  request: {
    select: {
      id: true,
      reference: true,
      summary: true,
      category: true,
    },
  },
};

export async function listAssignedRequests(supplierId: string): Promise<SupplierRequestOutput[]> {
  const rows = await prisma.supplierRequest.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });
  return rows.map(serializeSupplierRequest);
}

/**
 * When an operations agent marks an option as belonging to a particular supplier
 * and the customer has accepted & paid, a SupplierRequest row is created and
 * made visible to that supplier. If the supplier is not yet approved, the row
 * is NOT created (the supplier cannot operate).
 */
export async function assignRequestToSupplier(
  supplierId: string,
  requestId: string,
  input?: { override?: boolean; overrideNote?: string },
): Promise<SupplierRequestOutput> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { status: true } });
  if (!supplier || supplier.status !== SUPPLIER_STATUS.APPROVED) {
    throw new SupplierError("NOT_APPROVED", "Supplier is not approved.");
  }

  const request = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!request) {
    throw new SupplierError("NOT_FOUND", "Request not found.");
  }

  const existing = await prisma.supplierRequest.findUnique({
    where: { supplierId_requestId: { supplierId, requestId } },
  });
  if (existing) {
    throw new SupplierError("ALREADY_ASSIGNED", "This request is already assigned to this supplier.");
  }

  const overrideNote =
    input?.override === true
      ? input.overrideNote?.trim() || "Operator overrode the automated recommendation."
      : null;

  const row = await prisma.supplierRequest.create({
    data: {
      supplierId,
      requestId,
      status: "ASSIGNED",
      overrideNote,
    },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });

  return serializeSupplierRequest(row);
}

export async function actionSupplierRequest(
  supplierId: string,
  supplierRequestId: string,
  action: "accept" | "decline",
): Promise<SupplierRequestOutput> {
  const existing = await prisma.supplierRequest.findUnique({
    where: { id: supplierRequestId },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });
  if (!existing || existing.supplierId !== supplierId) {
    throw new SupplierError("NOT_FOUND", "Request assignment not found.");
  }

  if (existing.status !== "ASSIGNED") {
    throw new SupplierError("INVALID_TRANSITION", "Only assigned requests can be accepted or declined.");
  }

  const updated = await prisma.supplierRequest.update({
    where: { id: supplierRequestId },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });

  return serializeSupplierRequest(updated);
}

/**
 * Supplier marks an order fulfilled. Only ACCEPTED requests can be fulfilled.
 * An earning row is automatically created from the earned amount.
 */
export async function fulfillSupplierRequest(
  supplierId: string,
  supplierRequestId: string,
  input: { earnedNaira?: number; notes?: string },
): Promise<SupplierRequestOutput> {
  const existing = await prisma.supplierRequest.findUnique({
    where: { id: supplierRequestId },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });
  if (!existing || existing.supplierId !== supplierId) {
    throw new SupplierError("NOT_FOUND", "Request assignment not found.");
  }

  if (existing.status !== "ACCEPTED") {
    throw new SupplierError("INVALID_TRANSITION", "Only accepted requests can be marked as fulfilled.");
  }

  const earnedKobo =
    typeof input.earnedNaira === "number" && Number.isFinite(input.earnedNaira)
      ? minorUnitsFromMajor(input.earnedNaira)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.supplierRequest.update({
      where: { id: supplierRequestId },
      data: {
        earnedKobo,
        fulfilledAt: new Date(),
        notes: input.notes?.trim() || null,
        status: "ACCEPTED",
      },
    });

    if (earnedKobo !== null && earnedKobo > 0) {
      const existingEarning = await tx.supplierEarning.findUnique({
        where: { supplierId_requestId: { supplierId, requestId: existing.requestId } },
        select: { id: true },
      });
      if (!existingEarning) {
        await tx.supplierEarning.create({
          data: {
            supplierId,
            requestId: existing.requestId,
            amountKobo: earnedKobo,
          },
        });
      } else {
        await tx.supplierEarning.update({
          where: { id: existingEarning.id },
          data: { amountKobo: earnedKobo },
        });
      }
    }
  });

  const row = await prisma.supplierRequest.findUniqueOrThrow({
    where: { id: supplierRequestId },
    include: ASSIGNED_REQUESTS_INCLUDE,
  });

  return serializeSupplierRequest(row);
}

// ─── Earnings ───────────────────────────────────────────────────────────────

const EARNINGS_INCLUDE = {
  request: {
    select: {
      reference: true,
      summary: true,
    },
  },
};

export async function listSupplierEarnings(supplierId: string): Promise<SupplierEarningOutput[]> {
  const rows = await prisma.supplierEarning.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
    include: EARNINGS_INCLUDE,
  });
  return rows.map(serializeSupplierEarning);
}

export async function getSupplierEarningsSummary(supplierId: string): Promise<{
  totalEarnedNaira: number;
  totalPaidNaira: number;
  count: number;
}> {
  const rows = await prisma.supplierEarning.findMany({
    where: { supplierId },
    select: { amountKobo: true, status: true },
  });

  let totalEarnedKobo = 0;
  let totalPaidKobo = 0;

  for (const row of rows) {
    totalEarnedKobo += row.amountKobo;
    if (row.status === "PAID") {
      totalPaidKobo += row.amountKobo;
    }
  }

  return {
    totalEarnedNaira: majorUnitsFromMinor(totalEarnedKobo),
    totalPaidNaira: majorUnitsFromMinor(totalPaidKobo),
    count: rows.length,
  };
}

/**
 * Inbound requests matching the supplier's categories and service area that
 * have NOT yet been assigned. These are "opportunities" the supplier can see
 * and may express interest in (via the UI), but only after they are assigned
 * by an operations agent.
 */
export async function listInboundOpportunities(supplierId: string): Promise<
  Array<{
    id: string;
    reference: string;
    summary: string;
    category: string;
    categoryLabel: string;
    budgetNaira: number | null;
    location: string | null;
    createdAt: string;
  }>
> {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: SUPPLIER_CATEGORY_INCLUDE,
  });
  if (!supplier || supplier.status !== SUPPLIER_STATUS.APPROVED) {
    throw new SupplierError("NOT_APPROVED", "Supplier is not approved.");
  }

  const supplierCategories = supplier.supplierCategories.map((c) => c.categoryKey);

  if (supplierCategories.length === 0) {
    return [];
  }

  const alreadyAssigned = await prisma.supplierRequest.findMany({
    where: { supplierId },
    select: { requestId: true },
  });
  const assignedRequestIds = new Set(alreadyAssigned.map((r) => r.requestId));

  const requests = await prisma.request.findMany({
    where: {
      category: { in: supplierCategories },
      status: { in: ["PAID", "FULFILLMENT_PENDING", "PROCESSING"] },
      id: { notIn: Array.from(assignedRequestIds) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const { majorUnitsFromMinor } = await import("@/lib/money");
  const { categoryLabel } = await import("@/lib/requests/categories");

  return requests.map((r) => ({
    id: r.id,
    reference: r.reference,
    summary: r.summary,
    category: r.category,
    categoryLabel: categoryLabel(r.category),
    budgetNaira: r.budgetKobo === null ? null : majorUnitsFromMinor(r.budgetKobo),
    location: r.location,
    createdAt: r.createdAt.toISOString(),
  }));
}
