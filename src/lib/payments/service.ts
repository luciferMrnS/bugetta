import { prisma } from "@/lib/prisma";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { QUOTE_STATUS } from "@/lib/operations/quotes";
import { totalKobo } from "@/lib/operations/pricing";
import { PAYMENT_STATUS } from "@/lib/payments/status";
import {
  paymentEventSchema,
  randomHex,
  signWebhook,
  tokenMatches,
  verifyWebhookSignature,
  type PaymentEvent,
} from "@/lib/payments/provider";
import { sandboxCreateCheckout } from "@/lib/payments/sandbox";
import {
  serializePayment,
  serializeOperationPayment,
  type OperationPaymentOutput,
  type PaymentView,
} from "@/lib/payments/serialize";
import { runAutomation } from "@/lib/automation/service";

export class PaymentServiceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Maps payment domain error codes to HTTP statuses for API routes.
export function paymentHttpStatus(code: string): number {
  switch (code) {
    case "NOT_FOUND":
    case "PAYMENT_NOT_FOUND":
    case "NO_PAYMENT":
      return 404;
    case "PAYMENT_EVENT_INVALID":
      return 400;
    case "GATEWAY_FORBIDDEN":
    case "INVALID_SIGNATURE":
      return 401;
    case "PAYMENT_NOT_SUPPORTED":
      return 422;
    default:
      return 409;
  }
}

const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomReference(prefix: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `${prefix}-${out}`;
}

async function withUniqueReference<T extends { reference: string }>(
  build: (reference: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await build(randomReference("PAY", 10));
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
  throw new PaymentServiceError(
    "INTERNAL",
    "Could not allocate a unique reference.",
  );
}

// Opens a checkout for an approved request. Idempotent: a still-PENDING attempt
// is resumed (never duplicated); once a payment has succeeded the request is
// no longer payable and a new attempt is refused. Starting payment also hands
// the request from APPROVED to PAYMENT_PENDING (Phase 6).
export async function initializePayment(input: {
  userId: string;
  requestId: string;
}): Promise<{ payment: PaymentView; paymentUrl: string }> {
  const request = await prisma.request.findFirst({
    where: { id: input.requestId, customerId: input.userId },
    select: {
      id: true,
      status: true,
      quotes: {
        where: { status: QUOTE_STATUS.ACCEPTED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { priceKobo: true, serviceFeeKobo: true, deliveryFeeKobo: true },
      },
    },
  });
  if (!request) {
    throw new PaymentServiceError("NOT_FOUND", "Request not found.");
  }
  if (
    request.status !== REQUEST_STATUS.APPROVED &&
    request.status !== REQUEST_STATUS.PAYMENT_PENDING
  ) {
    throw new PaymentServiceError(
      "PAYMENT_NOT_REQUIRED",
      "This request is not waiting for payment.",
    );
  }
  const accepted = request.quotes[0];
  if (!accepted) {
    throw new PaymentServiceError(
      "NO_ACCEPTED_QUOTE",
      "No accepted option to pay for.",
    );
  }

  // A payment the customer has already paid (or refunded) means this request
  // has left APPROVED/PAYMENT_PENDING — the money state is authoritative.
  const latest = await prisma.payment.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  if (
    latest &&
    (latest.status === PAYMENT_STATUS.PAID ||
      latest.status === PAYMENT_STATUS.REFUNDED ||
      latest.status === PAYMENT_STATUS.PARTIALLY_REFUNDED)
  ) {
    throw new PaymentServiceError(
      "PAYMENT_ALREADY_PAID",
      "This request has already been paid.",
    );
  }

  // A still-open attempt is resumed so the customer never pays twice.
  const open = await prisma.payment.findFirst({
    where: { requestId: request.id, status: PAYMENT_STATUS.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (open) {
    return {
      payment: serializePayment(open),
      paymentUrl: `/pay/${open.reference}?token=${open.providerToken}`,
    };
  }

  const amountKobo = totalKobo({
    priceKobo: accepted.priceKobo,
    serviceFeeKobo: accepted.serviceFeeKobo,
    deliveryFeeKobo: accepted.deliveryFeeKobo,
  });

  // Creating the attempt and (for APPROVED) the request hand-off must be one
  // transaction: a payment never exists without PAYMENT_PENDING, and vice versa.
  const created = await withUniqueReference((reference) => {
    const intent = sandboxCreateCheckout(reference);
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          requestId: request.id,
          customerId: input.userId,
          reference,
          provider: intent.provider,
          providerReference: intent.providerReference,
          providerToken: intent.providerToken,
          webhookSecret: randomHex(32),
          amountKobo,
          currency: "NGN",
          status: PAYMENT_STATUS.PENDING,
          providerStatus: "pending",
        },
      });

      if (request.status === REQUEST_STATUS.APPROVED) {
        const moved = await tx.request.updateMany({
          where: { id: request.id, status: REQUEST_STATUS.APPROVED },
          data: { status: REQUEST_STATUS.PAYMENT_PENDING },
        });
        if (moved.count !== 1) {
          throw new PaymentServiceError(
            "PAYMENT_ALREADY_STARTED",
            "This request is already awaiting a payment attempt.",
          );
        }
        await tx.requestEvent.create({
          data: {
            requestId: request.id,
            fromStatus: REQUEST_STATUS.APPROVED,
            toStatus: REQUEST_STATUS.PAYMENT_PENDING,
            cause: "customer",
            actorId: input.userId,
            actorRole: "CUSTOMER",
          },
        });
      }

      return payment;
    });
  });

  return {
    payment: serializePayment(created),
    paymentUrl: `/pay/${created.reference}?token=${created.providerToken}`,
  };
}

// Latest payment for a request, with the provider status reconciled on the
// server before returning. Never trusts the frontend: the client only ever
// displays what this endpoint and the payment webhook produced.
export async function getPaymentForRequest(input: {
  userId: string;
  requestId: string;
}): Promise<PaymentView> {
  const request = await prisma.request.findFirst({
    where: { id: input.requestId, customerId: input.userId },
    select: { id: true },
  });
  if (!request) {
    throw new PaymentServiceError("NOT_FOUND", "Request not found.");
  }

  const payment = await prisma.payment.findFirst({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) {
    throw new PaymentServiceError("NO_PAYMENT", "No payment for this request.");
  }

  // Sandbox reconciliation: the provider's own state is authoritative and is
  // mirrored on this row; a real gateway would be queried here.
  return serializePayment(payment);
}

// The ONLY code path that captures money. Both the network webhook route and
// the sandbox gateway's charge step funnel a signed event through here, so no
// amount can ever be marked paid from frontend input.
export async function processPaymentEvent(input: {
  rawBody: string;
  signature: string;
}): Promise<PaymentView> {
  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    throw new PaymentServiceError(
      "PAYMENT_EVENT_INVALID",
      "Payment event body is not valid JSON.",
    );
  }

  const parsed = paymentEventSchema.safeParse(payload);
  if (!parsed.success) {
    throw new PaymentServiceError(
      "PAYMENT_EVENT_INVALID",
      "Payment event payload is invalid.",
    );
  }
  const event = parsed.data;

  const payment = await prisma.payment.findUnique({
    where: { reference: event.paymentReference },
  });
  if (!payment) {
    throw new PaymentServiceError(
      "PAYMENT_NOT_FOUND",
      "Payment not found for this event.",
    );
  }

  if (!verifyWebhookSignature(payment.webhookSecret ?? "", input.rawBody, input.signature)) {
    throw new PaymentServiceError(
      "INVALID_SIGNATURE",
      "Payment event signature is invalid.",
    );
  }

  if (event.amountKobo !== payment.amountKobo || event.currency !== payment.currency) {
    throw new PaymentServiceError(
      "AMOUNT_MISMATCH",
      "Payment event amount does not match the payment.",
    );
  }

  if (event.type === "payment.paid") {
    // Duplicate delivery of the same event must be a safe no-op.
    if (payment.status === PAYMENT_STATUS.PAID) {
      return serializePayment(payment);
    }

    await prisma.$transaction(async (tx) => {
      const captured = await tx.payment.updateMany({
        where: { id: payment.id, status: PAYMENT_STATUS.PENDING },
        data: {
          status: PAYMENT_STATUS.PAID,
          providerStatus: "paid",
          paidAt: new Date(),
        },
      });
      if (captured.count !== 1) {
        throw new PaymentServiceError(
          "PAYMENT_NOT_ACTIONABLE",
          "This payment cannot be captured in its current state.",
        );
      }

      const anotherPaid = await tx.payment.findFirst({
        where: {
          requestId: payment.requestId,
          status: PAYMENT_STATUS.PAID,
          id: { not: payment.id },
        },
        select: { id: true },
      });
      if (anotherPaid) {
        throw new PaymentServiceError(
          "ALREADY_CAPTURED",
          "This request has already been paid.",
        );
      }

      await tx.transaction.create({
        data: {
          paymentId: payment.id,
          type: "CHARGE",
          status: "SUCCEEDED",
          amountKobo: payment.amountKobo,
          reference: uniqueTxnReference("TXN-"),
          providerReference: event.providerReference,
        },
      });

      // Request moves to PAID only if it is still awaiting payment (e.g. it
      // cannot have been cancelled in a way that forces the money back).
      await tx.request.updateMany({
        where: { id: payment.requestId, status: REQUEST_STATUS.PAYMENT_PENDING },
        data: { status: REQUEST_STATUS.PAID },
      });

      await tx.requestEvent.create({
        data: {
          requestId: payment.requestId,
          fromStatus: REQUEST_STATUS.PAYMENT_PENDING,
          toStatus: REQUEST_STATUS.PAID,
          cause: "payment",
        },
      });
    });

    const refreshed = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    runAutomation({ trigger: "PAYMENT_PAID", requestId: payment.requestId }).catch(() => {});
    return serializePayment(refreshed);
  }

  if (event.type === "payment.failed") {
    if (payment.status === PAYMENT_STATUS.FAILED) {
      return serializePayment(payment);
    }

    await prisma.$transaction(async (tx) => {
      const failed = await tx.payment.updateMany({
        where: { id: payment.id, status: PAYMENT_STATUS.PENDING },
        data: {
          status: PAYMENT_STATUS.FAILED,
          providerStatus: "declined",
          failedAt: new Date(),
        },
      });
      if (failed.count !== 1) {
        throw new PaymentServiceError(
          "PAYMENT_NOT_ACTIONABLE",
          "This payment cannot be failed in its current state.",
        );
      }

      await tx.transaction.create({
        data: {
          paymentId: payment.id,
          type: "CHARGE",
          status: "FAILED",
          amountKobo: payment.amountKobo,
          reference: uniqueTxnReference("TXN-"),
          providerReference: event.providerReference,
        },
      });
    });

    const refreshed = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    return serializePayment(refreshed);
  }

  // payment.refunded is not dispatched by the sandbox gateway: refunds are
  // issued by operations through the refund route, which opens the REFUND
  // transaction itself. A real provider pushing this event can be wired here.
  throw new PaymentServiceError(
    "PAYMENT_NOT_SUPPORTED",
    "Refund events from providers are not supported yet.",
  );
}

// Full refund issued by an operator/admin. The payment is marked REFUNDED, a
// REFUND ledger row is recorded, and the request moves to terminal REFUNDED
// (from PAID or DISPUTED) so money and order state stay in lockstep (Phase 6).
export async function createRefund(input: {
  paymentId: string;
  operatorUserId: string;
  reason?: string;
}): Promise<OperationPaymentOutput> {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { request: { select: { status: true } } },
  });
  if (!payment) {
    throw new PaymentServiceError("NOT_FOUND", "Payment not found.");
  }
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw new PaymentServiceError(
      "REFUND_NOT_ALLOWED",
      "Only a paid payment can be refunded.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.create({
      data: {
        paymentId: payment.id,
        type: "REFUND",
        status: "SUCCEEDED",
        amountKobo: payment.amountKobo,
        reference: uniqueTxnReference("TXN-"),
        providerReference: `SBOX-RFD-${payment.providerReference}`,
      },
    });

    await tx.refund.create({
      data: {
        paymentId: payment.id,
        amountKobo: payment.amountKobo,
        reason: input.reason?.trim() || null,
        createdById: input.operatorUserId,
        reference: uniqueRefundReference(),
        transactionId: txn.id,
      },
    });

    const moved = await tx.payment.updateMany({
      where: { id: payment.id, status: PAYMENT_STATUS.PAID },
      data: { status: PAYMENT_STATUS.REFUNDED },
    });
    if (moved.count !== 1) {
      throw new PaymentServiceError(
        "ALREADY_REFUNDED",
        "This payment has already been refunded.",
      );
    }

    const requestMoved = await tx.request.updateMany({
      where: {
        id: payment.requestId,
        status: { in: [REQUEST_STATUS.PAID, REQUEST_STATUS.DISPUTED] },
      },
      data: { status: REQUEST_STATUS.REFUNDED },
    });
    if (requestMoved.count === 1) {
      await tx.requestEvent.create({
        data: {
          requestId: payment.requestId,
          fromStatus: payment.request.status,
          toStatus: REQUEST_STATUS.REFUNDED,
          cause: "refund",
          actorId: input.operatorUserId,
          actorRole: "OPERATIONS",
        },
      });
    }
  });

  const refreshed = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: {
      transactions: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  return serializeOperationPayment(refreshed);
}

// The sandbox gateway's charge step. It authenticates the one-time checkout
// token, then — exactly like a real provider would — signs and emits a webhook
// event through the SAME capture path (processPaymentEvent). The frontend never
// reports success: the outcome is whatever the processed event produced.
export async function sandboxChargePayment(input: {
  reference: string;
  token: string;
  outcome: "success" | "decline";
}): Promise<PaymentView> {
  const payment = await prisma.payment.findUnique({
    where: { reference: input.reference },
  });
  if (!payment) {
    throw new PaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found.");
  }

  if (!payment.providerToken || !tokenMatches(input.token, payment.providerToken)) {
    throw new PaymentServiceError("GATEWAY_FORBIDDEN", "Checkout token is invalid.");
  }

  // Already captured or failed: resend the same outcome, never double-charge.
  if (payment.status === PAYMENT_STATUS.PAID) {
    if (input.outcome === "success") {
      return serializePayment(payment);
    }
    throw new PaymentServiceError(
      "PAYMENT_NOT_ACTIONABLE",
      "This payment is already complete.",
    );
  }
  if (payment.status === PAYMENT_STATUS.FAILED) {
    if (input.outcome === "decline") {
      return serializePayment(payment);
    }
    throw new PaymentServiceError(
      "PAYMENT_NOT_ACTIONABLE",
      "This payment has already failed.",
    );
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new PaymentServiceError(
      "PAYMENT_NOT_ACTIONABLE",
      "This payment cannot be charged in its current state.",
    );
  }

  const request = await prisma.request.findUnique({
    where: { id: payment.requestId },
    select: { status: true },
  });
  if (!request || request.status !== REQUEST_STATUS.PAYMENT_PENDING) {
    throw new PaymentServiceError(
      "PAYMENT_NOT_ACTIONABLE",
      "This request is not awaiting payment.",
    );
  }

  const event: PaymentEvent = {
    type:
      input.outcome === "success"
        ? "payment.paid"
        : "payment.failed",
    paymentReference: payment.reference,
    providerReference: payment.providerReference,
    amountKobo: payment.amountKobo,
    currency: payment.currency,
    occurredAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(event);
  const signature = signWebhook(payment.webhookSecret ?? "", rawBody);
  return processPaymentEvent({ rawBody, signature });
}

let txnCounter = 0;
function uniqueTxnReference(prefix: string): string {
  const time = Date.now().toString(36).toUpperCase();
  txnCounter += 1;
  return `${prefix}${time}${txnCounter.toString(36).toUpperCase().padStart(4, "0")}`;
}

let refundCounter = 0;
function uniqueRefundReference(): string {
  const time = Date.now().toString(36).toUpperCase();
  refundCounter += 1;
  return `RFD-${time}${refundCounter.toString(36).toUpperCase().padStart(4, "0")}`;
}