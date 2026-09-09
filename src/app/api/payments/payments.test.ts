import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import {
  ORIGIN,
  createOperatorAndCollectCookies,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { POST as createRequestRoute } from "@/app/api/requests/route";
import { GET as customerDetailRoute } from "@/app/api/requests/[id]/route";
import { POST as opsStatusRoute } from "@/app/api/operations/requests/[id]/status/route";
import { POST as opsQuotesRoute } from "@/app/api/operations/requests/[id]/quotes/route";
import { POST as decisionRoute } from "@/app/api/requests/[id]/decision/route";
import { GET as opsDetailRoute } from "@/app/api/operations/requests/[id]/route";
import { POST as initializeRoute } from "@/app/api/requests/[id]/payment/initialize/route";
import { POST as sandboxChargeRoute } from "@/app/api/payments/providers/sandbox/charge/route";
import { POST as webhookRoute } from "@/app/api/webhooks/payments/route";
import { POST as refundRoute } from "@/app/api/payments/[id]/refund/route";
import type { RequestOutput as CustomerRequestOutput } from "@/lib/requests/serialize";
import type {
  OperationQuoteOutput,
  OperationRequestOutput,
} from "@/lib/operations/serialize";
import type { OperationPaymentOutput, PaymentView } from "@/lib/payments/serialize";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { PAYMENT_STATUS } from "@/lib/payments/status";
import { signWebhook } from "@/lib/payments/provider";
import { totalKobo } from "@/lib/operations/pricing";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function expectBody<T>(value: T | undefined | null, label: string): T {
  expect(value).toBeDefined();
  if (value === undefined || value === null) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function makeApiRequest(
  session: NextRequest,
  csrf: string,
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      origin: ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (csrf !== "") {
    withCsrfHeader(req, csrf);
  }
  copyCookies(session, req);
  return req;
}

function makeApiGet(session: NextRequest, path: string): NextRequest {
  const req = makeRead(path);
  copyCookies(session, req);
  return req;
}

async function createPendingPaymentRequest(): Promise<{
  customerReq: NextRequest;
  customerCsrf: string;
  opsReq: NextRequest;
  opsCsrf: string;
  requestId: string;
  quoteId: string;
  amountKobo: number;
}> {
  const { req: customerReq, csrf: customerCsrf } = await registerAndCollectCookies();

  const createRes = await createRequestRoute(
    makeApiRequest(customerReq, customerCsrf, "/api/requests", "POST", {
      description: "I need a 55 inch smart TV delivered to Yaba",
    }),
  );
  expect(createRes.status).toBe(201);
  const createJson = (await createRes.json()) as {
    data?: { request?: CustomerRequestOutput };
  };
  const requestId = expectBody(createJson.data?.request, "request").id;

  const { req: opsReq, csrf: opsCsrf } = await createOperatorAndCollectCookies();

  for (const status of [
      REQUEST_STATUS.RESEARCHING,
      REQUEST_STATUS.OPTIONS_FOUND,
      REQUEST_STATUS.AWAITING_CUSTOMER,
    ]) {
    const res = await opsStatusRoute(
      makeApiRequest(
        opsReq,
        opsCsrf,
        `/api/operations/requests/${requestId}/status`,
        "POST",
        { status },
      ),
      { params: Promise.resolve({ id: requestId }) } as never,
    );
    expect(res.status).toBe(200);
  }

  const quoteRes = await opsQuotesRoute(
    makeApiRequest(opsReq, opsCsrf, `/api/operations/requests/${requestId}/quotes`, "POST", {
      productName: "TCL 55 QLED",
      priceNaira: 640_000,
      serviceFeeNaira: 8_000,
      deliveryFeeNaira: 4_000,
      estimatedDelivery: "3 days",
    }),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(quoteRes.status).toBe(201);
  const quote = expectBody(
    ((await quoteRes.json()) as { data?: { quote?: OperationQuoteOutput } }).data?.quote,
    "quote",
  );

  const amountKobo = totalKobo({
    priceKobo: 640_000 * 100,
    serviceFeeKobo: 8_000 * 100,
    deliveryFeeKobo: 4_000 * 100,
  });

  const decideRes = await decisionRoute(
    makeApiRequest(customerReq, customerCsrf, `/api/requests/${requestId}/decision`, "POST", {
      quoteId: quote.id,
      action: "SELECT",
    }),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(decideRes.status).toBe(200);

  return { customerReq, customerCsrf, opsReq, opsCsrf, requestId, quoteId: quote.id, amountKobo };
}

interface InitializedPayment {
  reference: string;
  token: string;
  payment: PaymentView;
}

async function initialize(
  customerReq: NextRequest,
  customerCsrf: string,
  requestId: string,
): Promise<InitializedPayment> {
  const res = await initializeRoute(
    makeApiRequest(
      customerReq,
      customerCsrf,
      `/api/requests/${requestId}/payment/initialize`,
      "POST",
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as {
    data?: { payment?: PaymentView; paymentUrl?: string };
  };
  const payment = expectBody(json.data?.payment, "payment");
  const paymentUrl = expectBody(json.data?.paymentUrl, "paymentUrl");
  const match = paymentUrl.match(/\/pay\/([^?]+)\?token=([^&]+)/);
  expect(match).not.toBeNull();
  return { reference: `${match![1]}`, token: `${match![2]}`, payment };
}

async function webhookFor(
  payment: { reference: string },
  secret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const rawBody = JSON.stringify(body);
  const signature = signWebhook(secret, rawBody);
  const req = new NextRequest(`${ORIGIN}/api/webhooks/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bugetta-signature": signature,
      "x-forwarded-for": nextClientIp(),
    },
    body: rawBody,
  });
  return webhookRoute(req);
}

describe("api payments / Phase 5", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("captures a payment via the sandbox charge, recording the ledger and moving the request to PAID", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    // Charge: the gateway succeeds and emits the signed event server-side.
    const chargeRes = await sandboxChargeRoute(
      new NextRequest(`${ORIGIN}/api/payments/providers/sandbox/charge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify({ reference: init.reference, token: init.token, outcome: "success" }),
      }),
    );
    expect(chargeRes.status).toBe(200);
    const chargeJson = (await chargeRes.json()) as {
      data?: { payment?: PaymentView };
      error?: { code?: string };
    };
    expect(chargeJson.error?.code).toBeUndefined();
    expect(chargeJson.data?.payment?.status).toBe(PAYMENT_STATUS.PAID);

    // The webhook was the capture path: Payment PAID + one CHARGE txn.
    const row = await prisma.payment.findUnique({ where: { reference: init.reference } });
    expect(row?.status).toBe(PAYMENT_STATUS.PAID);
    expect(row?.amountKobo).toBe(fixture.amountKobo);
    expect(row?.paidAt).not.toBeNull();
    const txns = await prisma.transaction.findMany({ where: { paymentId: row!.id } });
    expect(txns.length).toBe(1);
    expect(txns[0].type).toBe("CHARGE");
    expect(txns[0].status).toBe("SUCCEEDED");
    expect(txns[0].amountKobo).toBe(fixture.amountKobo);

    // Request is now PAID server-side, with the payment capture recorded in the
    // status history (system path, not an operator move).
    const customer = await customerDetailRoute(
      makeApiGet(fixture.customerReq, `/api/requests/${fixture.requestId}`),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    const customerJson = (await customer.json()) as {
      data?: { request?: CustomerRequestOutput };
    };
    expect(customerJson.data?.request?.status).toBe(REQUEST_STATUS.PAID);
    expect(
      customerJson.data?.request?.statusEvents.some(
        (e) => e.toStatus === "PAID" && e.cause === "payment",
      ),
    ).toBe(true);
    // Customer sees a payment view carrying the exact amount.
    expect(customerJson.data?.request?.payment?.amountNaira).toBe(
      majorFromMinor(fixture.amountKobo),
    );
    expect(customerJson.data?.request?.payment?.status).toBe(PAYMENT_STATUS.PAID);

    // Operator sees the full payment with its ledger.
    const ops = await opsDetailRoute(
      makeApiGet(fixture.opsReq, `/api/operations/requests/${fixture.requestId}`),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    const opsJson = (await ops.json()) as {
      data?: { request?: OperationRequestOutput };
    };
    const opsRequest = expectBody(opsJson.data?.request, "request");
    expect(opsRequest.status).toBe(REQUEST_STATUS.PAID);
    const opsPayment = opsRequest.payments.find((p) => p.id === row!.id)!;
    expect(opsPayment.status).toBe(PAYMENT_STATUS.PAID);
    expect(opsPayment.transactions.length).toBe(1);
    expect(opsPayment.transactions[0].type).toBe("CHARGE");
    expect(opsPayment.transactions[0].amountNaira).toBe(majorFromMinor(fixture.amountKobo));
  });

  it("marks a payment FAILED on decline, leaving the request awaiting payment for retry", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    const chargeRes = await sandboxChargeRoute(
      new NextRequest(`${ORIGIN}/api/payments/providers/sandbox/charge`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": nextClientIp(),
        },
        body: JSON.stringify({ reference: init.reference, token: init.token, outcome: "decline" }),
      }),
    );
    expect(chargeRes.status).toBe(200);
    const chargeJson = (await chargeRes.json()) as { data?: { payment?: PaymentView } };
    expect(chargeJson.data?.payment?.status).toBe(PAYMENT_STATUS.FAILED);

    const row = await prisma.payment.findUnique({ where: { reference: init.reference } });
    expect(row?.status).toBe(PAYMENT_STATUS.FAILED);
    expect(row?.failedAt).not.toBeNull();

    const requestRow = await prisma.request.findUnique({ where: { id: fixture.requestId } });
    // Request stays PAYMENT_PENDING so the customer can retry.
    expect(requestRow?.status).toBe(REQUEST_STATUS.PAYMENT_PENDING);

    // Re-initializing after a FAILED attempt opens a fresh PENDING payment.
    const retry = await initializeRoute(
      makeApiRequest(
        fixture.customerReq,
        fixture.customerCsrf,
        `/api/requests/${fixture.requestId}/payment/initialize`,
        "POST",
      ),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(retry.status).toBe(201);
    const retryJson = (await retry.json()) as { data?: { payment?: PaymentView } };
    expect(retryJson.data?.payment?.status).toBe(PAYMENT_STATUS.PENDING);
    expect(retryJson.data?.payment?.reference).not.toBe(init.reference);
    const retryRow = await prisma.payment.findUnique({
      where: { reference: retryJson.data?.payment?.reference },
    });
    const txns = await prisma.transaction.findMany({ where: { paymentId: retryRow!.id } });
    expect(txns.length).toBe(0);
  });

  it("is idempotent: a duplicate webhook never double-charges or double-transitions", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);
    const row = await prisma.payment.findUniqueOrThrow({
      where: { reference: init.reference },
    });
    const secret = row.webhookSecret!;

    const body = {
      type: "payment.paid",
      paymentReference: init.reference,
      providerReference: row.providerReference,
      amountKobo: fixture.amountKobo,
      currency: "NGN",
      occurredAt: new Date().toISOString(),
    };

    const first = await webhookFor({ reference: init.reference }, secret, body);
    expect(first.status).toBe(200);
    const second = await webhookFor({ reference: init.reference }, secret, body);
    expect(second.status).toBe(200);

    // Exactly one CHARGE transaction, one PAID payment.
    const txns = await prisma.transaction.findMany({ where: { paymentId: row.id } });
    expect(txns.filter((t) => t.type === "CHARGE" && t.status === "SUCCEEDED").length).toBe(1);
    expect(txns.length).toBe(1);
    const payments = await prisma.payment.findMany({
      where: { requestId: fixture.requestId },
      select: { status: true },
    });
    expect(payments.filter((p) => p.status === PAYMENT_STATUS.PAID).length).toBe(1);
    const requestRow = await prisma.request.findUnique({ where: { id: fixture.requestId } });
    expect(requestRow?.status).toBe(REQUEST_STATUS.PAID);
  });

  it("rejects a webhook with a forged signature", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);
    const row = await prisma.payment.findUniqueOrThrow({
      where: { reference: init.reference },
    });

    const body = {
      type: "payment.paid",
      paymentReference: init.reference,
      providerReference: row.providerReference,
      amountKobo: fixture.amountKobo,
      currency: "NGN",
      occurredAt: new Date().toISOString(),
    };
    // Wrong secret -> wrong signature.
    const res = await webhookFor({ reference: init.reference }, "totally-wrong-secret", body);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "INVALID_SIGNATURE",
    );

    // Nothing was captured.
    const refreshed = await prisma.payment.findUniqueOrThrow({ where: { id: row.id } });
    expect(refreshed.status).toBe(PAYMENT_STATUS.PENDING);
  });

  it("rejects a webhook whose amount does not match the payment", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);
    const row = await prisma.payment.findUniqueOrThrow({
      where: { reference: init.reference },
    });

    const rawBody = JSON.stringify({
      type: "payment.paid",
      paymentReference: init.reference,
      providerReference: row.providerReference,
      amountKobo: fixture.amountKobo + 1,
      currency: "NGN",
      occurredAt: new Date().toISOString(),
    });
    const signature = signWebhook(row.webhookSecret!, rawBody);
    const req = new NextRequest(`${ORIGIN}/api/webhooks/payments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bugetta-signature": signature,
        "x-forwarded-for": nextClientIp(),
      },
      body: rawBody,
    });
    const res = await webhookRoute(req);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "AMOUNT_MISMATCH",
    );

    const refreshed = await prisma.payment.findUniqueOrThrow({ where: { id: row.id } });
    expect(refreshed.status).toBe(PAYMENT_STATUS.PENDING);
  });

  it("rejects charging with an invalid or missing checkout token", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    const wrongToken = await sandboxChargeRoute(
      new NextRequest(`${ORIGIN}/api/payments/providers/sandbox/charge`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": nextClientIp() },
        body: JSON.stringify({ reference: init.reference, token: "forged", outcome: "success" }),
      }),
    );
    expect(wrongToken.status).toBe(401);
    expect(((await wrongToken.json()) as { error?: { code?: string } }).error?.code).toBe(
      "GATEWAY_FORBIDDEN",
    );

    const row = await prisma.payment.findUnique({ where: { reference: init.reference } });
    expect(row?.status).toBe(PAYMENT_STATUS.PENDING);
  });

  it("refunds a paid payment (full amount), records the refund ledger, and blocks a duplicate refund", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    await sandboxChargeRoute(
      new NextRequest(`${ORIGIN}/api/payments/providers/sandbox/charge`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": nextClientIp() },
        body: JSON.stringify({ reference: init.reference, token: init.token, outcome: "success" }),
      }),
    );
    const paid = await prisma.payment.findUniqueOrThrow({ where: { reference: init.reference } });
    expect(paid.status).toBe(PAYMENT_STATUS.PAID);

    const refundRes = await refundRoute(
      makeApiRequest(
        fixture.opsReq,
        fixture.opsCsrf,
        `/api/payments/${paid.id}/refund`,
        "POST",
        { reason: "Customer changed their mind." },
      ),
      { params: Promise.resolve({ id: paid.id }) } as never,
    );
    expect(refundRes.status).toBe(200);
    const refundJson = (await refundRes.json()) as {
      data?: { payment?: OperationPaymentOutput };
    };
    const refunded = expectBody(refundJson.data?.payment, "payment");
    expect(refunded.status).toBe(PAYMENT_STATUS.REFUNDED);
    expect(refunded.refunds.length).toBe(1);
    expect(refunded.refunds[0].amountNaira).toBe(majorFromMinor(fixture.amountKobo));
    expect(refunded.refunds[0].reason).toBe("Customer changed their mind.");
    expect(
      refunded.transactions.some(
        (t: { type: string; status: string }) =>
          t.type === "REFUND" && t.status === "SUCCEEDED",
      ),
    ).toBe(true);

    const refundRows = await prisma.refund.findMany({ where: { paymentId: paid.id } });
    expect(refundRows.length).toBe(1);
    expect(refundRows[0].amountKobo).toBe(fixture.amountKobo);
    expect(refundRows[0].status).toBe("PROCESSED");
    expect(refundRows[0].transactionId).toBeTruthy();

    // The request moves to terminal REFUNDED so order state matches the money.
    const requestRow = await prisma.request.findUnique({ where: { id: fixture.requestId } });
    expect(requestRow?.status).toBe(REQUEST_STATUS.REFUNDED);
    const refundEvent = await prisma.requestEvent.findFirst({
      where: { requestId: fixture.requestId, toStatus: "REFUNDED" },
    });
    expect(refundEvent?.cause).toBe("refund");
    expect(refundEvent?.actorRole).toBe("OPERATIONS");

    // Duplicate full refund -> 409 (the payment is no longer PAID, so a second
    // refund is refused regardless of which error guard fires first).
    const dupRes = await refundRoute(
      makeApiRequest(
        fixture.opsReq,
        fixture.opsCsrf,
        `/api/payments/${paid.id}/refund`,
        "POST",
        { reason: "Again" },
      ),
      { params: Promise.resolve({ id: paid.id }) } as never,
    );
    expect(dupRes.status).toBe(409);
    expect(((await dupRes.json()) as { error?: { code?: string } }).error?.code).toBe(
      "REFUND_NOT_ALLOWED",
    );
    const txnsAfter = await prisma.transaction.findMany({ where: { paymentId: paid.id } });
    expect(txnsAfter.filter((t) => t.type === "REFUND").length).toBe(1);
  });

  it("blocks initialization once the request is already paid", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    await sandboxChargeRoute(
      new NextRequest(`${ORIGIN}/api/payments/providers/sandbox/charge`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": nextClientIp() },
        body: JSON.stringify({ reference: init.reference, token: init.token, outcome: "success" }),
      }),
    );

    const res = await initializeRoute(
      makeApiRequest(
        fixture.customerReq,
        fixture.customerCsrf,
        `/api/requests/${fixture.requestId}/payment/initialize`,
        "POST",
      ),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(res.status).toBe(409);
    // The request is already PAID (not PAYMENT_PENDING), so initialization is
    // refused outright — whichever guard reports it, no new attempt is made.
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "PAYMENT_NOT_REQUIRED",
    );
  });

  it("resumes a still-pending payment instead of creating a duplicate attempt", async () => {
    const fixture = await createPendingPaymentRequest();
    const init = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);

    const again = await initialize(fixture.customerReq, fixture.customerCsrf, fixture.requestId);
    expect(again.reference).toBe(init.reference);
    expect(again.token).toBe(init.token);

    const payments = await prisma.payment.findMany({ where: { requestId: fixture.requestId } });
    expect(payments.length).toBe(1);
  });
});

function majorFromMinor(minor: number): number {
  return minor / 100;
}