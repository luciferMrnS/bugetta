import { prisma } from "@/lib/prisma";
import { minorUnitsFromMajor, formatNaira } from "@/lib/money";
import {
  operatorAllowedTransitions,
  type RequestStatusKey,
} from "@/lib/requests/status";
import {
  serializeOperationsRequest,
  serializeOperationsRequestCard,
  serializeOption,
  serializeQuote,
  type OperationOptionOutput,
  type OperationRequestCard,
  type OperationRequestOutput,
  type OperationQuoteOutput,
} from "@/lib/operations/serialize";
import { sendNotification } from "@/lib/notify/service";

export class OperationsError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const OPERATIONS_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  items: { orderBy: { sortOrder: "asc" as const } },
  options: { orderBy: { createdAt: "desc" as const } },
  quotes: { orderBy: { createdAt: "desc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
  payments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      transactions: { orderBy: { createdAt: "desc" as const } },
      refunds: { orderBy: { createdAt: "desc" as const } },
    },
  },
};

export async function listRequestsForOperations(): Promise<OperationRequestCard[]> {
  const rows = await prisma.request.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
    },
  });
  return rows.map(serializeOperationsRequestCard);
}

export async function getRequestForOperations(
  requestId: string,
): Promise<OperationRequestOutput | null> {
  const row = await prisma.request.findUnique({
    where: { id: requestId },
    include: OPERATIONS_INCLUDE,
  });
  return row ? serializeOperationsRequest(row) : null;
}

export async function transitionRequestStatus(input: {
  requestId: string;
  nextStatus: string;
  operatorUserId: string;
  operatorRole: string;
}): Promise<OperationRequestOutput> {
  const row = await prisma.request.findUnique({
    where: { id: input.requestId },
    include: OPERATIONS_INCLUDE,
  });
  if (!row) {
    throw new OperationsError("NOT_FOUND", "Request not found.");
  }

  // Operators are bound by their own subset of the lifecycle: they drive
  // research, decisions hand-off and fulfilment, but never touch money states
  // (APPROVED → PAYMENT_PENDING → PAID → REFUNDED are system-driven).
  const allowed = operatorAllowedTransitions(row.status);
  if (!allowed.includes(input.nextStatus as RequestStatusKey)) {
    throw new OperationsError(
      "INVALID_TRANSITION",
      `Cannot move a request from ${row.status} to ${input.nextStatus}.`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.request.update({
      where: { id: input.requestId },
      data: { status: input.nextStatus },
    });
    await tx.requestEvent.create({
      data: {
        requestId: input.requestId,
        fromStatus: row.status,
        toStatus: input.nextStatus,
        cause: "operator",
        actorId: input.operatorUserId,
        actorRole: input.operatorRole,
      },
    });
    return tx.request.findUniqueOrThrow({
      where: { id: input.requestId },
      include: OPERATIONS_INCLUDE,
    });
  });

  return serializeOperationsRequest(updated);
}

export interface CreateOptionInput {
  supplier: string;
  productName: string;
  priceNaira?: number | null;
  availability?: string;
  estimatedDelivery?: string;
  notes?: string;
  terms?: string;
  images?: string[];
}

export async function createRequestOption(
  requestId: string,
  input: CreateOptionInput,
): Promise<OperationOptionOutput> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!request) {
    throw new OperationsError("NOT_FOUND", "Request not found.");
  }

  const priceKobo =
    typeof input.priceNaira === "number" && Number.isFinite(input.priceNaira)
      ? minorUnitsFromMajor(input.priceNaira)
      : null;

  const option = await prisma.requestOption.create({
    data: {
      requestId,
      supplier: input.supplier.trim(),
      productName: input.productName.trim(),
      priceKobo,
      availability: input.availability?.trim() || null,
      estimatedDelivery: input.estimatedDelivery?.trim() || null,
      notes: input.notes?.trim() || null,
      terms: input.terms?.trim() || null,
      images: JSON.stringify(
        Array.isArray(input.images) ? input.images : [],
      ),
    },
  });

  return serializeOption(option);
}

export interface CreateQuoteInput {
  optionId?: string;
  productName: string;
  priceNaira: number;
  serviceFeeNaira?: number;
  deliveryFeeNaira?: number;
  information?: string;
  images?: string[];
  estimatedDelivery?: string;
  terms?: string;
  validUntil?: string;
  source?: "MANUAL" | "AUTO";
}

export async function createRequestQuote(
  requestId: string,
  input: CreateQuoteInput,
): Promise<OperationQuoteOutput> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!request) {
    throw new OperationsError("NOT_FOUND", "Request not found.");
  }

  if (input.optionId) {
    const option = await prisma.requestOption.findFirst({
      where: { id: input.optionId, requestId },
      select: { id: true },
    });
    if (!option) {
      throw new OperationsError(
        "INVALID_OPTION",
        "The selected option does not belong to this request.",
      );
    }
  }

  const validUntil = input.validUntil
    ? new Date(`${input.validUntil}T23:59:59.999Z`)
    : null;

  const quote = await prisma.quote.create({
    data: {
      requestId,
      optionId: input.optionId || null,
      productName: input.productName.trim(),
      priceKobo: minorUnitsFromMajor(input.priceNaira),
      serviceFeeKobo: minorUnitsFromMajor(input.serviceFeeNaira ?? 0),
      deliveryFeeKobo: minorUnitsFromMajor(input.deliveryFeeNaira ?? 0),
      information: input.information?.trim() || null,
      images: JSON.stringify(
        Array.isArray(input.images) ? input.images : [],
      ),
      estimatedDelivery: input.estimatedDelivery?.trim() || null,
      terms: input.terms?.trim() || null,
      validUntil,
      status: "PENDING",
      source: input.source ?? "MANUAL",
    },
  });

  // Notify customer that a new quote is ready (quotes are created by the
  // team manually — automation no longer auto-quotes).
  if (quote.source === "MANUAL") {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { customerId: true, reference: true },
    });
    if (request) {
      sendNotification({
        userId: request.customerId,
        kind: "QUOTE_READY",
        reference: request.reference,
        vars: {
          ref: request.reference,
          productName: quote.productName,
          priceLabel: formatNaira(quote.priceKobo + quote.serviceFeeKobo + quote.deliveryFeeKobo),
        },
      }).catch(() => {});
    }
  }

  return serializeQuote(quote);
}