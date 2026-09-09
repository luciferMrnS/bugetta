// Phase 11 — customer ratings of suppliers. One rating per (request, supplier,
// customer), validated + upserted here. Submission is guarded by ownership and
// by eligibility rules in lib/trust/types.ts (money/service must have started).
import { prisma } from "@/lib/prisma";
import { RATING_ELIGIBLE_REQUEST_STATUSES, TrustError } from "@/lib/trust/types";

export interface SubmitRatingInput {
  requestId: string;
  customerId: string;
  supplierId: string;
  score: number;
  comment?: string;
}

// Rating eligibility: the request must belong to the customer, be in a
// state at-or-after payment, and have this supplier assigned to it.
async function loadRatableContext(
  requestId: string,
  customerId: string,
  supplierId: string,
) {
  const request = await prisma.request.findFirst({
    where: { id: requestId, customerId },
    select: { id: true, status: true },
  });
  if (!request) {
    throw new TrustError("NOT_FOUND", "Request not found.");
  }
  if (
    !RATING_ELIGIBLE_REQUEST_STATUSES.includes(
      request.status as (typeof RATING_ELIGIBLE_REQUEST_STATUSES)[number],
    )
  ) {
    throw new TrustError(
      "NOT_RATEABLE",
      "This request can only be rated once fulfilment has started.",
    );
  }
  const assignment = await prisma.supplierRequest.findFirst({
    where: { requestId: request.id, supplierId },
    select: { id: true },
  });
  if (!assignment) {
    throw new TrustError("NOT_ASSIGNED", "This supplier did not serve the request.");
  }
  return request;
}

export async function submitRating(input: SubmitRatingInput) {
  if (
    !Number.isInteger(input.score) ||
    input.score < 1 ||
    input.score > 5
  ) {
    throw new TrustError(
      "INVALID_SCORE",
      "Rating score must be a whole number between 1 and 5.",
    );
  }

  await loadRatableContext(
    input.requestId,
    input.customerId,
    input.supplierId,
  );

  const rating = await prisma.rating.upsert({
    where: {
      requestId_supplierId_customerId: {
        requestId: input.requestId,
        supplierId: input.supplierId,
        customerId: input.customerId,
      },
    },
    update: {
      score: input.score,
      comment: input.comment?.trim() || null,
    },
    create: {
      requestId: input.requestId,
      supplierId: input.supplierId,
      customerId: input.customerId,
      score: input.score,
      comment: input.comment?.trim() || null,
    },
  });

  return rating;
}

// Suppliers attached to a request that the customer may rate, each with the
// customer's existing rating (if any) so the UI can pre-fill or disable.
export async function getRatableSuppliers(input: {
  requestId: string;
  customerId: string;
}) {
  const request = await prisma.request.findFirst({
    where: { id: input.requestId, customerId: input.customerId },
    select: { id: true, status: true },
  });
  if (!request) {
    throw new TrustError("NOT_FOUND", "Request not found.");
  }

  const eligible = RATING_ELIGIBLE_REQUEST_STATUSES.includes(
    request.status as (typeof RATING_ELIGIBLE_REQUEST_STATUSES)[number],
  );
  if (!eligible) {
    return { eligible: false, suppliers: [] };
  }

  const assignments = await prisma.supplierRequest.findMany({
    where: { requestId: request.id },
    select: {
      supplier: {
        select: {
          id: true,
          businessName: true,
          ratings: {
            where: { customerId: input.customerId },
            select: {
              id: true,
              score: true,
              comment: true,
              createdAt: true,
              updatedAt: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  return {
    eligible: true,
    suppliers: assignments.map(({ supplier }) => ({
      id: supplier.id,
      businessName: supplier.businessName,
      rating: supplier.ratings[0] ?? null,
    })),
  };
}

// Aggregate summary used by the supplier dashboard and admin trust views.
export async function supplierRatingSummary(supplierId: string) {
  const rows = await prisma.rating.findMany({
    where: { supplierId },
    select: { score: true },
  });

  const count = rows.length;
  const sum = rows.reduce((acc, row) => acc + row.score, 0);
  const average = count > 0 ? Math.round((sum / count) * 100) / 100 : null;
  const distribution = Array.from({ length: 5 }, (_, index) => ({
    score: index + 1,
    count: rows.filter((row) => row.score === index + 1).length,
  }));

  return { count, average, distribution };
}

// Recent ratings a supplier received, newest first.
export async function listSupplierRatings(supplierId: string, limit = 20) {
  return prisma.rating.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      request: { select: { reference: true, summary: true } },
      customer: { select: { name: true } },
    },
  });
}