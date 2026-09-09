import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { minorUnitsFromMajor } from "@/lib/money";
import {
  POST as createRequestRoute,
} from "@/app/api/requests/route";
import { GET as customerDetailRoute } from "@/app/api/requests/[id]/route";
import { GET as opsListRoute } from "@/app/api/operations/requests/route";
import { GET as opsDetailRoute } from "@/app/api/operations/requests/[id]/route";
import { POST as opsStatusRoute } from "@/app/api/operations/requests/[id]/status/route";
import { POST as opsOptionsRoute } from "@/app/api/operations/requests/[id]/options/route";
import { POST as opsQuotesRoute } from "@/app/api/operations/requests/[id]/quotes/route";
import {
  ORIGIN,
  createOperatorAndCollectCookies,
  makeRead,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import type { RequestOutput as CustomerRequestOutput } from "@/lib/requests/serialize";
import type {
  OperationOptionOutput,
  OperationQuoteOutput,
  OperationRequestOutput,
} from "@/lib/operations/serialize";

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

async function createCustomerRequest(
  description: string,
): Promise<{ req: NextRequest; csrf: string; request: CustomerRequestOutput }> {
  const { req, csrf } = await registerAndCollectCookies();
  const res = await createRequestRoute(
    makeApiRequest(req, csrf, "/api/requests", "POST", { description }),
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as {
    data?: { request?: CustomerRequestOutput };
  };
  const request = json.data?.request;
  expect(request).toBeDefined();
  return { req, csrf, request: request! };
}

describe("api /api/operations/requests in isolated DB", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("rejects everyone without an operations role", async () => {
    const anonList = await opsListRoute(makeRead("/api/operations/requests"));
    expect(anonList.status).toBe(401);

    const customer = await createCustomerRequest(
      "I need a standing fan, 3 speed",
    );
    const customerList = await opsListRoute(
      makeApiGet(customer.req, "/api/operations/requests"),
    );
    expect(customerList.status).toBe(403);
    const customerListJson = (await customerList.json()) as {
      error?: { code?: string };
    };
    expect(customerListJson.error?.code).toBe("FORBIDDEN");

    const customerDetail = await opsDetailRoute(
      makeApiGet(customer.req, `/api/operations/requests/${customer.request.id}`),
      { params: Promise.resolve({ id: customer.request.id }) } as never,
    );
    expect(customerDetail.status).toBe(403);

    const customerStatus = await opsStatusRoute(
      makeApiRequest(
        customer.req,
        customer.csrf,
        `/api/operations/requests/${customer.request.id}/status`,
        "POST",
        { status: "PENDING" },
      ),
      { params: Promise.resolve({ id: customer.request.id }) } as never,
    );
    expect(customerStatus.status).toBe(403);
  });

  it("lets OPERATIONS and ADMIN see incoming requests with author details", async () => {
    const { request: created } = await createCustomerRequest(
      "I need repair of a faulty laptop screen, HP EliteBook, in Yaba",
    );

    const ops = await createOperatorAndCollectCookies();
    const listRes = await opsListRoute(makeApiGet(ops.req, "/api/operations/requests"));
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as {
      data?: { requests: OperationRequestOutput[] };
    };
    const listed = listJson.data?.requests ?? [];
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const detailRes = await opsDetailRoute(
      makeApiGet(ops.req, `/api/operations/requests/${created.id}`),
      { params: Promise.resolve({ id: created.id }) } as never,
    );
    expect(detailRes.status).toBe(200);
    const detailJson = (await detailRes.json()) as {
      data?: { request?: OperationRequestOutput };
    };
    const detail = expectBody(detailJson.data?.request, "request");
    expect(detail.status).toBe("REQUESTED");
    expect(detail.reference).toMatch(/^REQ-/);
    expect(detail.customer.name).toBe("Ada Obi");
    expect(detail.customer.email).toContain("@example.com");
    expect(detail.summary).toContain("laptop");
    expect(detail.allowedTransitions).toEqual(
      expect.arrayContaining(["RESEARCHING", "CANCELLED"]),
    );
    expect(detail.statusEvents).toEqual([
      expect.objectContaining({ toStatus: "REQUESTED", cause: "created" }),
    ]);

    await prisma.user.update({
      where: { email: ops.email },
      data: { role: ROLES.ADMIN },
    });
    const adminGet = await makeApiGet(ops.req, "/api/operations/requests");
    // Same session, now an ADMIN role.
    const adminList = await opsListRoute(adminGet);
    expect(adminList.status).toBe(200);
  });

  it("transitions status step by step and rejects illegal moves", async () => {
    const { request } = await createCustomerRequest(
      "I need bespoke suits, wedding party of 6 groomsmen",
    );
    const ops = await createOperatorAndCollectCookies();

    async function move(status: string): Promise<{
      code: number;
      body: { error?: { code?: string }; data?: { request?: OperationRequestOutput } };
    }> {
      const res = await opsStatusRoute(
        makeApiRequest(
          ops.req,
          ops.csrf,
          `/api/operations/requests/${request.id}/status`,
          "POST",
          { status },
        ),
        { params: Promise.resolve({ id: request.id }) } as never,
      );
      return { code: res.status, body: (await res.json()) as never };
    }

    // Illegal jump: REQUESTED -> PAID
    const jump = await move("PAID");
    expect(jump.code).toBe(409);
    expect(jump.body.error?.code).toBe("INVALID_TRANSITION");

    // Unknown status value
    const unknown = await opsStatusRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/status`,
        "POST",
        { status: "WHEREVER" },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(unknown.status).toBe(422);

    // Walk the intake side of the lifecycle.
    const intake = [
      "RESEARCHING",
      "OPTIONS_FOUND",
      "AWAITING_CUSTOMER",
    ];
    let current = "REQUESTED";
    for (const next of intake) {
      const result = await move(next);
      expect(result.code, `transition to ${next}`).toBe(200);
      expect(result.body.data?.request?.status).toBe(next);
      current = next;
    }
    expect(current).toBe("AWAITING_CUSTOMER");

    // The approval and payment hand-off is customer/system-only: an operator
    // can never push AWAITING_CUSTOMER towards APPROVED or skip to PAID.
    const invalidApprove = await move("APPROVED");
    expect(invalidApprove.code).toBe(409);
    expect(invalidApprove.body.error?.code).toBe("INVALID_TRANSITION");

    const invalidPaid = await move("PAID");
    expect(invalidPaid.code).toBe(409);
    expect(invalidPaid.body.error?.code).toBe("INVALID_TRANSITION");

    // Simulate the payment webhook landing by moving the request to PAID directly.
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "PAID" },
    });

    // Walk the fulfilment side of the lifecycle.
    const fulfilment = [
      "FULFILLMENT_PENDING",
      "PROCESSING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "COMPLETED",
    ];
    let lastResult: {
      code: number;
      body: { error?: { code?: string }; data?: { request?: OperationRequestOutput } };
    } | null = null;
    for (const next of fulfilment) {
      const result = await move(next);
      lastResult = result;
      expect(result.code, `transition to ${next}`).toBe(200);
      expect(result.body.data?.request?.status).toBe(next);
      current = next;
    }
    expect(current).toBe("COMPLETED");

    // Every operator move is preserved in the immutable status history.
    expect(
      lastResult?.body.data?.request?.statusEvents.some(
        (event) => event.toStatus === "COMPLETED" && event.cause === "operator",
      ),
    ).toBe(true);

    // Terminal order: a completed order can only be disputed (operator may not
// re-open the money or fulfilment path).
    const reopened = await opsStatusRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/status`,
        "POST",
        { status: "PAID" },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(reopened.status).toBe(409);
    expect(((await reopened.json()) as { error?: { code?: string } }).error?.code).toBe(
      "INVALID_TRANSITION",
    );

    // Missing request
    const missing = await opsStatusRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        "/api/operations/requests/does-not-exist/status",
        "POST",
        { status: "COMPLETED" },
      ),
      { params: Promise.resolve({ id: "does-not-exist" }) } as never,
    );
    expect(missing.status).toBe(404);
  });

  it("creates supplier options with internal details", async () => {
    const { request } = await createCustomerRequest(
      "I need catering for 120 guests, Nigerian dishes",
    );
    const ops = await createOperatorAndCollectCookies();

    const res = await opsOptionsRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/options`,
        "POST",
        {
          supplier: "Mama Put Events",
          productName: "Jollof rice, fried rice, chicken & moi moi",
          priceNaira: 620_000,
          availability: "Confirmed, 2 weeks lead time",
          estimatedDelivery: "3 days",
          notes: "Contact Fatima, requires 50% deposit",
          terms: "Cancellation fee applies after 48 hours",
          images: ["https://example.com/menu.jpg"],
        },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(res.status).toBe(201);

    const json = (await res.json()) as { data?: { option?: OperationOptionOutput } };
    const option = expectBody(json.data?.option, "option");
    expect(option.supplier).toBe("Mama Put Events");
    expect(option.priceNaira).toBe(620_000);
    expect(option.availability).toContain("Confirmed");
    expect(option.notes).toContain("Fatima");
    expect(option.images).toEqual(["https://example.com/menu.jpg"]);

    const row = await prisma.requestOption.findUnique({
      where: { id: option.id },
    });
    expect(row?.priceKobo).toBe(minorUnitsFromMajor(620_000));

    // Validation: supplier required.
    const invalid = await opsOptionsRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/options`,
        "POST",
        { supplier: "", productName: "Thing" },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(invalid.status).toBe(422);

    // Missing request
    const missing = await opsOptionsRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        "/api/operations/requests/does-not-exist/options",
        "POST",
        { supplier: "X", productName: "Y" },
      ),
      { params: Promise.resolve({ id: "does-not-exist" }) } as never,
    );
    expect(missing.status).toBe(404);
  });

  it("creates quotes and only ever exposes customer-safe fields", async () => {
    const { req, request } = await createCustomerRequest(
      "I need a 65 inch smart TV delivered to Surulere",
    );
    const ops = await createOperatorAndCollectCookies();

    const optionRes = await opsOptionsRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/options`,
        "POST",
        {
          supplier: "ElectronX Lagos",
          productName: "Samsung 65 QLED",
          priceNaira: 850_000,
          notes: "Margin 12%",
        },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    const optionJson = (await optionRes.json()) as {
      data?: { option?: OperationOptionOutput };
    };
    const option = expectBody(optionJson.data?.option, "option");

    const quoteRes = await opsQuotesRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${request.id}/quotes`,
        "POST",
        {
          optionId: option.id,
          productName: "Samsung 65 QLED with 1-year warranty",
          priceNaira: 900_000,
          estimatedDelivery: "5 days",
          validUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          terms: "Valid for 72 hours. Delivery and installation included.",
        },
      ),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(quoteRes.status).toBe(201);

    const quoteJson = (await quoteRes.json()) as {
      data?: { quote?: OperationQuoteOutput };
    };
    const quote = expectBody(quoteJson.data?.quote, "quote");
    expect(quote.status).toBe("PENDING");
    expect(quote.statusLabel).toBe("Offer ready");
    expect(quote.priceNaira).toBe(900_000);

    // Correct option linkage is also visible on the ops detail.
    const opsDetail = await opsDetailRoute(
      makeApiGet(ops.req, `/api/operations/requests/${request.id}`),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    const opsJson = (await opsDetail.json()) as {
      data?: { request?: OperationRequestOutput };
    };
    expect(opsJson.data?.request?.quotes[0]?.optionId).toBe(option.id);
    expect(opsJson.data?.request?.options[0]?.notes).toBe("Margin 12%");

    // Customer view: only the safe quote fields, no supplier/option internals.
    const customerRes = await customerDetailRoute(
      makeApiGet(req, `/api/requests/${request.id}`),
      { params: Promise.resolve({ id: request.id }) } as never,
    );
    expect(customerRes.status).toBe(200);
    const customerJson = (await customerRes.json()) as {
      data?: { request?: CustomerRequestOutput };
    };
    const customerQuotes = customerJson.data?.request?.quotes ?? [];
    expect(customerQuotes.length).toBe(1);
    const activeQuote = customerQuotes[0];
    expect(activeQuote).toMatchObject({
      productName: "Samsung 65 QLED with 1-year warranty",
      priceNaira: 900_000,
      serviceFeeNaira: 0,
      deliveryFeeNaira: 0,
      totalNaira: 900_000,
      estimatedDelivery: "5 days",
      status: "PENDING",
      statusLabel: "Offer ready",
      information: null,
      images: [],
    });
    expect(Object.keys(activeQuote).sort()).toEqual([
      "deliveryFeeNaira",
      "estimatedDelivery",
      "id",
      "images",
      "information",
      "priceNaira",
      "productName",
      "serviceFeeNaira",
      "status",
      "statusLabel",
      "terms",
      "totalNaira",
      "validUntil",
    ]);
    expect((customerJson.data?.request as { activeQuote?: unknown }).activeQuote).toBeUndefined();
    expect(customerJson.data?.request).not.toHaveProperty("options");
    expect(customerJson.data?.request).not.toHaveProperty("supplier");
  });

  it("refuses to quote an option from another request", async () => {
    const first = await createCustomerRequest("I need event canopies for a naming ceremony");
    const second = await createCustomerRequest("I need branded mugs for a staff party");
    const ops = await createOperatorAndCollectCookies();

    const optionRes = await opsOptionsRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${first.request.id}/options`,
        "POST",
        { supplier: "Tent Co", productName: "Canopy rental, 20x40", priceNaira: 250_000 },
      ),
      { params: Promise.resolve({ id: first.request.id }) } as never,
    );
    const option = expectBody(
      ((await optionRes.json()) as { data?: { option?: OperationOptionOutput } })
        .data?.option,
      "option",
    );

    const cross = await opsQuotesRoute(
      makeApiRequest(
        ops.req,
        ops.csrf,
        `/api/operations/requests/${second.request.id}/quotes`,
        "POST",
        {
          optionId: option.id,
          productName: "Canopy rental",
          priceNaira: 250_000,
        },
      ),
      { params: Promise.resolve({ id: second.request.id }) } as never,
    );
    expect(cross.status).toBe(422);
    const crossJson = (await cross.json()) as {
      error?: { code?: string; fieldErrors?: Record<string, string[]> };
    };
    expect(crossJson.error?.code).toBe("INVALID_OPTION");
    expect(crossJson.error?.fieldErrors?.optionId).toBeDefined();
  });
});