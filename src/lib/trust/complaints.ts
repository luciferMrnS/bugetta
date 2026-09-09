// Phase 11 — complaints. Raised about a supplier, customer, or request and
// triaged by admins. Opening a complaint about a subject also re-runs that
// subject's deterministic fraud signals (lib/trust/fraud.ts).
import { prisma } from "@/lib/prisma";
import { COMPLAINT_STATUS, TrustError } from "@/lib/trust/types";
import { recordFraudFlags } from "@/lib/trust/fraud";

export interface RaiseComplaintInput {
  subjectType: string;
  subjectId: string;
  requestId?: string;
  raisedById: string;
  expectedOwnerId?: string; // when set, the linked request must belong to this user
  category: string;
  description: string;
}

async function assertSubjectExists(
  subjectType: string,
  subjectId: string,
): Promise<void> {
  if (subjectType === "SUPPLIER") {
    const supplier = await prisma.supplier.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!supplier) {
      throw new TrustError("NOT_FOUND", "Supplier not found.");
    }
    return;
  }
  if (subjectType === "CUSTOMER") {
    const user = await prisma.user.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!user) {
      throw new TrustError("NOT_FOUND", "Customer not found.");
    }
    return;
  }
  if (subjectType === "REQUEST") {
    const request = await prisma.request.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (request) {
      return;
    }
  }
  throw new TrustError("INVALID_SUBJECT", "Unknown complaint subject.");
}

export async function raiseComplaint(input: RaiseComplaintInput) {
  await assertSubjectExists(input.subjectType, input.subjectId);

  if (input.requestId) {
    const request = await prisma.request.findUnique({
      where: { id: input.requestId },
      select: { id: true, customerId: true },
    });
    if (!request) {
      throw new TrustError("INVALID_REQUEST", "Referenced request not found.");
    }
    if (
      input.expectedOwnerId &&
      request.customerId !== input.expectedOwnerId
    ) {
      throw new TrustError("NOT_FOUND", "Request not found.");
    }
  }

  const complaint = await prisma.complaint.create({
    data: {
      reference: nextComplaintReference(),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requestId: input.requestId || null,
      raisedById: input.raisedById,
      category: input.category,
      description: input.description.trim(),
      status: COMPLAINT_STATUS.OPEN,
    },
  });

  await recordFraudFlags(input.subjectType, input.subjectId);

  return complaint;
}

export async function listComplaints(
  input: { status?: string; limit?: number } = {},
) {
  return prisma.complaint.findMany({
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

export async function getComplaint(id: string) {
  return prisma.complaint.findUnique({
    where: { id },
    include: {
      request: {
        select: { reference: true, summary: true, status: true },
      },
    },
  });
}

export async function resolveComplaint(input: {
  complaintId: string;
  adminUserId: string;
  resolution: string;
}) {
  const complaint = await prisma.complaint.findUnique({
    where: { id: input.complaintId },
    select: { id: true, status: true },
  });
  if (!complaint) {
    throw new TrustError("NOT_FOUND", "Complaint not found.");
  }
  if (complaint.status === COMPLAINT_STATUS.RESOLVED) {
    throw new TrustError(
      "ALREADY_RESOLVED",
      "This complaint is already resolved.",
    );
  }

  return prisma.complaint.update({
    where: { id: input.complaintId },
    data: {
      status: COMPLAINT_STATUS.RESOLVED,
      resolution: input.resolution.trim(),
      resolvedById: input.adminUserId,
      resolvedAt: new Date(),
    },
  });
}

let complaintCounter = 0;
function nextComplaintReference(): string {
  const time = Date.now().toString(36).toUpperCase();
  complaintCounter += 1;
  return `CMP-${time}${complaintCounter.toString(36).toUpperCase().padStart(4, "0")}`;
}