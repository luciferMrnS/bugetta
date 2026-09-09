import { prisma } from "@/lib/prisma";
import { minorUnitsFromMajor } from "@/lib/money";
import { detectCategory } from "@/lib/requests/categories";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { QUOTE_STATUS } from "@/lib/operations/quotes";
import {
  extractBudgetKobo,
  extractDeadline,
  extractItemLines,
  extractSummary,
  parseImageLines,
} from "@/lib/requests/parseRequest";
import {
  serializeRequest,
  type RequestOutput,
} from "@/lib/requests/serialize";
import { runAutomation } from "@/lib/automation/service";

export interface CreateRequestInput {
  userId: string;
  description: string;
  items?: Array<{
    name: string;
    quantity?: string | null;
    note?: string | null;
  }>;
  budgetNaira?: number | null;
  quantity?: string | null;
  location?: string | null;
  deliveryDeadline?: string | null;
  instructions?: string | null;
  images?: string[];
}

export class RequestServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomReference(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `REQ-${out}`;
}

async function withUniqueReference<T extends { reference: string }>(
  build: (reference: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await build(randomReference());
    } catch (error) {
      const uniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (!uniqueViolation || attempt === 2) {
        throw error;
      }
    }
  }
  throw new RequestServiceError(
    "INTERNAL",
    "Could not allocate a request reference.",
  );
}

function toEndOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function parseDeadlineInput(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return toEndOfDay(parsed);
}

export async function createRequest(
  input: CreateRequestInput,
): Promise<RequestOutput> {
  const description = input.description.trim();
  const category = detectCategory(description);
  const summary = extractSummary(description);

  let items: NonNullable<CreateRequestInput["items"]>;
  if (input.items && input.items.length > 0) {
    const seen = new Set<string>();
    items = [];
    for (const item of input.items) {
      const name = item.name.trim();
      const key = name.toLowerCase();
      if (key.length === 0 || seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({
        name,
        quantity: item.quantity?.trim() || null,
        note: item.note?.trim() || null,
      });
    }
  } else {
    items = extractItemLines(description).map((name) => ({
      name,
      quantity: null,
      note: null,
    }));
  }

  const budgetKobo =
    typeof input.budgetNaira === "number" && Number.isFinite(input.budgetNaira)
      ? minorUnitsFromMajor(input.budgetNaira)
      : extractBudgetKobo(description);

  const deliveryDeadline =
    parseDeadlineInput(input.deliveryDeadline) ??
    extractDeadline(description);

  const images = parseImageLines(
    Array.isArray(input.images) ? input.images.join("\n") : "",
  );

  const created = await withUniqueReference(async (reference) => {
    return prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          reference,
          customerId: input.userId,
          category,
          summary,
          description,
          budgetKobo,
          quantity: input.quantity?.trim() || null,
          location: input.location?.trim() || null,
          deliveryDeadline,
          instructions: input.instructions?.trim() || null,
          images: JSON.stringify(images),
          status: REQUEST_STATUS.REQUESTED,
          items: {
            create: items.map((item, index) => ({
              name: item.name,
              quantity: item.quantity,
              note: item.note,
              sortOrder: index,
            })),
          },
        },
        select: { id: true },
      });
      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: REQUEST_STATUS.REQUESTED,
          cause: "created",
        },
      });
      return tx.request.findUniqueOrThrow({
        where: { id: request.id },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          events: { orderBy: { createdAt: "asc" } },
        },
      });
    });
  });

  const serialized = serializeRequest(created);
  // Fire automation after the request is persisted so matching sees it.
  // Errors must not break the primary operation — runAutomation catches
  // and records them as FAILED runs.
  runAutomation({ trigger: "REQUEST_CREATED", requestId: created.id }).catch(() => {});
  return serialized;
}

export async function listRequestsForUser(
  userId: string,
): Promise<RequestOutput[]> {
  const rows = await prisma.request.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      quotes: {
        where: { status: QUOTE_STATUS.PENDING },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return rows.map(serializeRequest);
}

export async function getRequestForUser(
  userId: string,
  requestId: string,
): Promise<RequestOutput | null> {
  const row = await prisma.request.findFirst({
    where: { id: requestId, customerId: userId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      quotes: {
        where: { status: { in: [QUOTE_STATUS.PENDING, QUOTE_STATUS.ACCEPTED] } },
        orderBy: { createdAt: "desc" },
      },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  return row ? serializeRequest(row) : null;
}

export type QuoteDecisionAction = "SELECT" | "REJECT" | "REQUEST_ANOTHER";

function isDecidableForCustomer(status: string): boolean {
  return status === REQUEST_STATUS.AWAITING_CUSTOMER;
}

export async function decideOnQuote(
  userId: string,
  requestId: string,
  quoteId: string,
  action: QuoteDecisionAction,
): Promise<RequestOutput> {
  const request = await prisma.request.findFirst({
    where: { id: requestId, customerId: userId },
    select: { id: true, status: true },
  });
  if (!request) {
    throw new RequestServiceError("NOT_FOUND", "Request not found.");
  }

  if (!isDecidableForCustomer(request.status)) {
    throw new RequestServiceError(
      "NOT_DECIDABLE",
      "This request is not awaiting your decision.",
    );
  }

  // REQUEST_ANOTHER needs no specific quote (the whole open batch retires);
  // SELECT/REJECT act on a particular PENDING quote.
  let quoteIdForAction: string | null = null;
  if (action === "SELECT" || action === "REJECT") {
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, requestId: request.id },
      select: { id: true, status: true },
    });
    if (!quote) {
      throw new RequestServiceError("QUOTE_NOT_FOUND", "Quote not found.");
    }
    if (quote.status !== QUOTE_STATUS.PENDING) {
      throw new RequestServiceError(
        "QUOTE_NOT_PENDING",
        "This option is no longer available to decide on.",
      );
    }
    quoteIdForAction = quote.id;
  }

  // REQUEST_ANOTHER can be raised even with no remaining PENDING quote, so it
  // has no quote-specific preconditions beyond ownership/decidability above.
  if (action === "REJECT") {
    await prisma.quote.update({
      where: { id: quoteIdForAction! },
      data: { status: QUOTE_STATUS.DECLINED },
    });
  } else if (action === "SELECT") {
    // Everything happens in one transaction with guarded updates so a
    // concurrent decision can never double-approve or race the status change.
    await prisma.$transaction(async (tx) => {
      const accepted = await tx.quote.updateMany({
        where: {
          id: quoteIdForAction!,
          requestId: request.id,
          status: QUOTE_STATUS.PENDING,
        },
        data: { status: QUOTE_STATUS.ACCEPTED },
      });
      if (accepted.count !== 1) {
        throw new RequestServiceError(
          "QUOTE_NOT_PENDING",
          "This option is no longer available to decide on.",
        );
      }

      await tx.quote.updateMany({
        where: {
          requestId: request.id,
          status: QUOTE_STATUS.PENDING,
          id: { not: quoteIdForAction! },
        },
        data: { status: QUOTE_STATUS.EXPIRED },
      });

      const moved = await tx.request.updateMany({
        where: { id: request.id, status: REQUEST_STATUS.AWAITING_CUSTOMER },
        data: {
          // Phase 6: selection approves the offer; the customer then pays.
          status: REQUEST_STATUS.APPROVED,
        },
      });
      if (moved.count !== 1) {
        throw new RequestServiceError(
          "NOT_DECIDABLE",
          "This request is no longer awaiting your decision.",
        );
      }

      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          fromStatus: REQUEST_STATUS.AWAITING_CUSTOMER,
          toStatus: REQUEST_STATUS.APPROVED,
          cause: "customer",
          actorId: userId,
          actorRole: "CUSTOMER",
        },
      });
    });
  } else {
    // REQUEST_ANOTHER: retire the whole open batch and move the request back
    // to RESEARCHING so the operations team can craft fresh options.
    await prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({
        where: { requestId: request.id, status: QUOTE_STATUS.PENDING },
        data: { status: QUOTE_STATUS.EXPIRED },
      });

      const moved = await tx.request.updateMany({
        where: { id: request.id, status: REQUEST_STATUS.AWAITING_CUSTOMER },
        data: { status: REQUEST_STATUS.RESEARCHING },
      });
      if (moved.count !== 1) {
        throw new RequestServiceError(
          "NOT_DECIDABLE",
          "This request is no longer awaiting your decision.",
        );
      }

      await tx.requestEvent.create({
        data: {
          requestId: request.id,
          fromStatus: REQUEST_STATUS.AWAITING_CUSTOMER,
          toStatus: REQUEST_STATUS.RESEARCHING,
          cause: "customer",
          actorId: userId,
          actorRole: "CUSTOMER",
        },
      });
    });
  }

  const refreshed = await getRequestForUser(userId, requestId);
  if (!refreshed) {
    throw new RequestServiceError("NOT_FOUND", "Request not found.");
  }
  return refreshed;
}