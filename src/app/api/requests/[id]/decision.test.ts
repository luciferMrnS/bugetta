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
import type { RequestOutput as CustomerRequestOutput } from "@/lib/requests/serialize";
import type {
  OperationQuoteOutput,
  OperationRequestOutput,
} from "@/lib/operations/serialize";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { QUOTE_STATUS } from "@/lib/operations/quotes";
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

interface Fixture {
  customerReq: NextRequest;
  customerCsrf: string;
  opsReq: NextRequest;
  opsCsrf: string;
  requestId: string;
}

async function setUpPendingCustomerRequest(): Promise<Fixture> {
  const { req: customerReq, csrf: customerCsrf } =
    await registerAndCollectCookies();

  const createRes = await createRequestRoute(
    makeApiRequest(
      customerReq,
      customerCsrf,
      "/api/requests",
      "POST",
      { description: "I need a 65 inch smart TV delivered to Surulere" },
    ),
  );
  expect(createRes.status).toBe(201);
  const createJson = (await createRes.json()) as {
    data?: { request?: CustomerRequestOutput };
  };
  const requestId = expectBody(createJson.data?.request, "request").id;

  const { req: opsReq, csrf: opsCsrf } = await createOperatorAndCollectCookies();

  // Walk REQUESTED -> RESEARCHING -> OPTIONS_FOUND -> AWAITING_CUSTOMER.
  const researchRes = await opsStatusRoute(
    makeApiRequest(
      opsReq,
      opsCsrf,
      `/api/operations/requests/${requestId}/status`,
      "POST",
      { status: REQUEST_STATUS.RESEARCHING },
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(researchRes.status).toBe(200);

  const optionsRes = await opsStatusRoute(
    makeApiRequest(
      opsReq,
      opsCsrf,
      `/api/operations/requests/${requestId}/status`,
      "POST",
      { status: REQUEST_STATUS.OPTIONS_FOUND },
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(optionsRes.status).toBe(200);

  const readyRes = await opsStatusRoute(
    makeApiRequest(
      opsReq,
      opsCsrf,
      `/api/operations/requests/${requestId}/status`,
      "POST",
      { status: REQUEST_STATUS.AWAITING_CUSTOMER },
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(readyRes.status).toBe(200);

  return { customerReq, customerCsrf, opsReq, opsCsrf, requestId };
}

async function addQuote(
  opsReq: NextRequest,
  opsCsrf: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<OperationQuoteOutput> {
  const res = await opsQuotesRoute(
    makeApiRequest(
      opsReq,
      opsCsrf,
      `/api/operations/requests/${requestId}/quotes`,
      "POST",
      body,
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as { data?: { quote?: OperationQuoteOutput } };
  return expectBody(json.data?.quote, "quote");
}

function decide(
  req: NextRequest,
  csrf: string,
  requestId: string,
  body: Record<string, unknown>,
) {
  return decisionRoute(
    makeApiRequest(
      req,
      csrf,
      `/api/requests/${requestId}/decision`,
      "POST",
      body,
    ),
    { params: Promise.resolve({ id: requestId }) } as never,
  );
}

describe("api /api/requests/[id]/decision (Phase 4)", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("requires a customer role, CSRF and a strict decision body", async () => {
    const fixture = await setUpPendingCustomerRequest();

    // Anonymous
    const anon = await decisionRoute(
      makeRead(`/api/requests/${fixture.requestId}/decision`),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(anon.status).toBe(401);

    // Operations user is not a customer
    const opsDecision = await decisionRoute(
      makeApiRequest(
        fixture.opsReq,
        fixture.opsCsrf,
        `/api/requests/${fixture.requestId}/decision`,
        "POST",
        { quoteId: "x", action: "SELECT" },
      ),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(opsDecision.status).toBe(403);

    // No CSRF header
    const noCsrf = await decisionRoute(
      makeApiRequest(
        fixture.customerReq,
        "",
        `/api/requests/${fixture.requestId}/decision`,
        "POST",
        { quoteId: "x", action: "SELECT" },
      ),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(noCsrf.status).toBe(403);
    expect(((await noCsrf.json()) as { error?: { code?: string } }).error?.code).toBe(
      "CSRF_TOKEN_MISSING",
    );

    // A crafted payload smuggling its own total is rejected.
    const tampered = await decide(
      fixture.customerReq,
      fixture.customerCsrf,
      fixture.requestId,
      { quoteId: "q1", action: "SELECT", totalNaira: 1 },
    );
    expect(tampered.status).toBe(422);

    // REQUEST_ANOTHER must not carry a quoteId.
    const strayQuote = await decide(
      fixture.customerReq,
      fixture.customerCsrf,
      fixture.requestId,
      { quoteId: "q1", action: "REQUEST_ANOTHER" },
    );
    expect(strayQuote.status).toBe(422);
  });

  it("rejects a decision when there are no pending quotes on a request", async () => {
    const fixture = await setUpPendingCustomerRequest();

    const res = await decide(
      fixture.customerReq,
      fixture.customerCsrf,
      fixture.requestId,
      { quoteId: "ghost", action: "SELECT" },
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "QUOTE_NOT_FOUND",
    );
  });

  it("lets the customer SELECT an option, locking it and other quotes expire", async () => {
    const fixture = await setUpPendingCustomerRequest();

    const quoteA = await addQuote(fixture.opsReq, fixture.opsCsrf, fixture.requestId, {
      productName: "Samsung 65 QLED",
      priceNaira: 850_000,
      serviceFeeNaira: 10_000,
      deliveryFeeNaira: 5_000,
      information: "In stock, same-day dispatch.",
      estimatedDelivery: "2 days",
    });
    const quoteB = await addQuote(fixture.opsReq, fixture.opsCsrf, fixture.requestId, {
      productName: "TCL 65 QLED",
      priceNaira: 780_000,
      serviceFeeNaira: 9_000,
      deliveryFeeNaira: 4_500,
      estimatedDelivery: "4 days",
    });

    // Customer sees all PENDING quotes with an accurate server-side total.
    const before = await customerDetailRoute(
      makeApiGet(fixture.customerReq, `/api/requests/${fixture.requestId}`),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    const beforeJson = (await before.json()) as {
      data?: { request?: CustomerRequestOutput };
    };
    const beforeQuotes = beforeJson.data?.request?.quotes ?? [];
    expect(beforeQuotes.length).toBe(2);
    const qA = beforeQuotes.find((q) => q.id === quoteA.id)!;
    expect(qA.totalNaira).toBe(
      majorFromMinor(
        totalKobo({
          priceKobo: 850_000 * 100,
          serviceFeeKobo: 10_000 * 100,
          deliveryFeeKobo: 5_000 * 100,
        }),
      ),
    );
    expect(qA.information).toBe("In stock, same-day dispatch.");
    expect(qA.images).toEqual([]);

    // SELECT quote A
    const res = await decide(fixture.customerReq, fixture.customerCsrf, fixture.requestId, {
      quoteId: quoteA.id,
      action: "SELECT",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: { request?: CustomerRequestOutput };
      error?: { code?: string };
    };
    expect(json.error?.code).toBeUndefined();
    const updated = expectBody(json.data?.request, "request");
    expect(updated.status).toBe(REQUEST_STATUS.APPROVED);
    // The customer's selection is recorded in the status history.
    expect(updated.statusEvents.some((e) => e.toStatus === "APPROVED" && e.cause === "customer")).toBe(
      true,
    );

    // The selected quote is ACCEPTED and surfaced; the other quote is gone
    // from the customer view (it EXPIRED and is no longer PENDING/ACCEPTED).
    const accepted = updated.quotes.find((q) => q.id === quoteA.id);
    expect(accepted?.status).toBe(QUOTE_STATUS.ACCEPTED);
    expect(updated.quotes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: quoteB.id })]),
    );

    // DB state
    const qARow = await prisma.quote.findUnique({ where: { id: quoteA.id } });
    expect(qARow?.status).toBe(QUOTE_STATUS.ACCEPTED);
    const qBRow = await prisma.quote.findUnique({ where: { id: quoteB.id } });
    expect(qBRow?.status).toBe(QUOTE_STATUS.EXPIRED);

    // Operator sees the accepted quote and the request now APPROVED.
    const ops = await opsDetailRoute(
      makeApiGet(fixture.opsReq, `/api/operations/requests/${fixture.requestId}`),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    const opsJson = (await ops.json()) as {
      data?: { request?: OperationRequestOutput };
    };
    const opsRequest = expectBody(opsJson.data?.request, "request");
    expect(opsRequest.status).toBe(REQUEST_STATUS.APPROVED);
    const acceptedForOps = opsRequest.quotes.find((q) => q.id === quoteA.id);
    expect(acceptedForOps?.statusLabel).toBe("Accepted");
    const expiredForOps = opsRequest.quotes.find((q) => q.id === quoteB.id);
    expect(expiredForOps?.statusLabel).toBe("Expired");
  });

  it("marks a quote DECLINED without moving the request status", async () => {
    const fixture = await setUpPendingCustomerRequest();
    const quote = await addQuote(fixture.opsReq, fixture.opsCsrf, fixture.requestId, {
      productName: "Hisense 65 4K",
      priceNaira: 720_000,
      estimatedDelivery: "3 days",
    });

    const res = await decide(fixture.customerReq, fixture.customerCsrf, fixture.requestId, {
      quoteId: quote.id,
      action: "REJECT",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { request?: CustomerRequestOutput } };

    // Request stays AWAITING_CUSTOMER; the DECLINED quote is hidden from the
    // customer but its status is recorded for operations.
    expect(json.data?.request?.status).toBe(REQUEST_STATUS.AWAITING_CUSTOMER);
    expect(json.data?.request?.quotes.length).toBe(0);

    const row = await prisma.quote.findUnique({ where: { id: quote.id } });
    expect(row?.status).toBe(QUOTE_STATUS.DECLINED);
  });

  it("sends the request back to RESEARCHING on REQUEST_ANOTHER", async () => {
    const fixture = await setUpPendingCustomerRequest();
    const quote = await addQuote(fixture.opsReq, fixture.opsCsrf, fixture.requestId, {
      productName: "LG 65 OLED",
      priceNaira: 1_200_000,
      estimatedDelivery: "5 days",
    });

    const res = await decide(fixture.customerReq, fixture.customerCsrf, fixture.requestId, {
      action: "REQUEST_ANOTHER",
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data?: { request?: CustomerRequestOutput } };
    expect(json.data?.request?.status).toBe(REQUEST_STATUS.RESEARCHING);
    expect(json.data?.request?.quotes.length).toBe(0);

    const row = await prisma.quote.findUnique({ where: { id: quote.id } });
    expect(row?.status).toBe(QUOTE_STATUS.EXPIRED);
  });

  it("blocks decisions once the request leaves AWAITING_CUSTOMER", async () => {
    const fixture = await setUpPendingCustomerRequest();
    const quote = await addQuote(fixture.opsReq, fixture.opsCsrf, fixture.requestId, {
      productName: "Samsung 65 QLED",
      priceNaira: 850_000,
    });

    // Operator moves the request away from AWAITING_CUSTOMER.
    const back = await opsStatusRoute(
      makeApiRequest(
        fixture.opsReq,
        fixture.opsCsrf,
        `/api/operations/requests/${fixture.requestId}/status`,
        "POST",
        { status: REQUEST_STATUS.RESEARCHING },
      ),
      { params: Promise.resolve({ id: fixture.requestId }) } as never,
    );
    expect(back.status).toBe(200);

    const res = await decide(fixture.customerReq, fixture.customerCsrf, fixture.requestId, {
      quoteId: quote.id,
      action: "SELECT",
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "NOT_DECIDABLE",
    );
  });

  it("rejects decisions for a quote belonging to another request", async () => {
    const first = await setUpPendingCustomerRequest();
    const customerReq = first.customerReq;
    const customerCsrf = first.customerCsrf;
    // The same customer owns a second pending request.
    const secondCreate = await createRequestRoute(
      makeApiRequest(customerReq, customerCsrf, "/api/requests", "POST", {
        description: "I need a soundbar delivered to Ikeja",
      }),
    );
    const secondId = expectBody(
      ((await secondCreate.json()) as { data?: { request?: CustomerRequestOutput } })
        .data?.request,
      "second request",
    ).id;
    const research = await opsStatusRoute(
      makeApiRequest(
        first.opsReq,
        first.opsCsrf,
        `/api/operations/requests/${secondId}/status`,
        "POST",
        { status: REQUEST_STATUS.RESEARCHING },
      ),
      { params: Promise.resolve({ id: secondId }) } as never,
    );
    expect(research.status).toBe(200);
    const options = await opsStatusRoute(
      makeApiRequest(
        first.opsReq,
        first.opsCsrf,
        `/api/operations/requests/${secondId}/status`,
        "POST",
        { status: REQUEST_STATUS.OPTIONS_FOUND },
      ),
      { params: Promise.resolve({ id: secondId }) } as never,
    );
    expect(options.status).toBe(200);
    const ready = await opsStatusRoute(
      makeApiRequest(
        first.opsReq,
        first.opsCsrf,
        `/api/operations/requests/${secondId}/status`,
        "POST",
        { status: REQUEST_STATUS.AWAITING_CUSTOMER },
      ),
      { params: Promise.resolve({ id: secondId }) } as never,
    );
    expect(ready.status).toBe(200);

    const quote = await addQuote(first.opsReq, first.opsCsrf, first.requestId, {
      productName: "Sony 65 Bravia",
      priceNaira: 990_000,
    });

    const res = await decide(customerReq, customerCsrf, secondId, {
      quoteId: quote.id,
      action: "SELECT",
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error?: { code?: string } }).error?.code).toBe(
      "QUOTE_NOT_FOUND",
    );
  });
});

// Local helpers rather than importing money internals (mirrors how a naira
// input of X maps to X*100 kobo).
function majorFromMinor(minor: number): number {
  return minor / 100;
}
