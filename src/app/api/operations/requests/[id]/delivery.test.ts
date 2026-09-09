import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  ORIGIN,
  PASSWORD,
  createOperatorAndCollectCookies,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import {
  GET as deliveryGetRoute,
  POST as deliveryCreateRoute,
} from "@/app/api/operations/requests/[id]/delivery/route";
import { POST as deliveryStatusRoute } from "@/app/api/operations/requests/[id]/delivery/status/route";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeGet(session: NextRequest | null, path: string): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, { method: "GET" });
  if (session) copyCookies(session, req);
  return req;
}

function makePost(
  session: NextRequest | null,
  path: string,
  body: unknown,
  options: { origin?: string; csrf?: boolean } = {},
): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: options.origin ?? ORIGIN,
      "x-forwarded-for": nextClientIp(),
    },
    body: JSON.stringify(body),
  });
  if (session) copyCookies(session, req);
  if (options.csrf !== false && session) {
    withCsrfHeader(req, session.cookies.get("bugetta_csrf")?.value ?? "");
  }
  return req;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let seedCounter = 0;

async function seedPaidRequest(location: string | null = "Ikeja") {
  seedCounter += 1;
  const email = `dlv-cust-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`;
  const customer = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "Customer",
      role: ROLES.CUSTOMER,
    },
  });
  const request = await prisma.request.create({
    data: {
      reference: `DLV-REQ-${seedCounter}-${Date.now()}`,
      customerId: customer.id,
      category: "FOOD",
      summary: "Delivery test",
      description: "Seed request for delivery routes.",
      budgetKobo: 5_000_000,
      location,
      status: "PAID",
    },
  });
  return { requestId: request.id, customerId: customer.id };
}

async function seedUnpaidRequest() {
  seedCounter += 1;
  const email = `dlv-unpaid-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`;
  const customer = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "Customer",
      role: ROLES.CUSTOMER,
    },
  });
  const request = await prisma.request.create({
    data: {
      reference: `DLV-UNPAID-${seedCounter}-${Date.now()}`,
      customerId: customer.id,
      category: "FOOD",
      summary: "Not paid yet",
      description: "Seed request that has not been paid.",
      budgetKobo: 5_000_000,
      location: "Ikeja",
      status: "APPROVED",
    },
  });
  return { requestId: request.id };
}

describe("GET /api/operations/requests/[id]/delivery", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("guards the endpoint: anonymous 401, customer 403, operator 200", async () => {
    const { requestId } = await seedPaidRequest();

    const anon = await deliveryGetRoute(
      makeGet(null, `/api/operations/requests/${requestId}/delivery`),
      params(requestId),
    );
    expect(anon.status).toBe(401);

    const customer = await registerAndCollectCookies();
    const asCustomer = await deliveryGetRoute(
      makeGet(customer.req, `/api/operations/requests/${requestId}/delivery`),
      params(requestId),
    );
    expect(asCustomer.status).toBe(403);

    const operator = await createOperatorAndCollectCookies();
    // The operator passes the guard and reaches the handler (404: no delivery).
    const asOperator = await deliveryGetRoute(
      makeGet(operator.req, `/api/operations/requests/${requestId}/delivery`),
      params(requestId),
    );
    expect(asOperator.status).toBe(404);
  });

  it("returns 404 for an unknown request and an empty one", async () => {
    const operator = await createOperatorAndCollectCookies();

    const unknown = await deliveryGetRoute(
      makeGet(operator.req, "/api/operations/requests/missing/delivery"),
      params("missing"),
    );
    expect(unknown.status).toBe(404);

    const { requestId } = await seedPaidRequest();
    const empty = await deliveryGetRoute(
      makeGet(operator.req, `/api/operations/requests/${requestId}/delivery`),
      params(requestId),
    );
    expect(empty.status).toBe(404);
  });
});

describe("POST /api/operations/requests/[id]/delivery", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("rejects calls without a CSRF token or from another origin", async () => {
    const { requestId } = await seedPaidRequest();
    const operator = await createOperatorAndCollectCookies();
    const path = `/api/operations/requests/${requestId}/delivery`;

    const noCsrf = await deliveryCreateRoute(
      makePost(operator.req, path, {}, { csrf: false }),
      params(requestId),
    );
    expect(noCsrf.status).toBe(403);

    const foreign = await deliveryCreateRoute(
      makePost(operator.req, path, {}, { origin: "https://evil.example" }),
      params(requestId),
    );
    expect(foreign.status).toBe(403);
  });

  it("refuses to deliver an unpaid request", async () => {
    const { requestId } = await seedUnpaidRequest();
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryCreateRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery`, {}),
      params(requestId),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("REQUEST_NOT_PAID");
  });

  it("assigns a delivery with a server-side fee and ETA for a paid request", async () => {
    const { requestId } = await seedPaidRequest("Ikeja G.R.A, Lagos");
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryCreateRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery`, {}),
      params(requestId),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const delivery = json.data.delivery;

    expect(delivery.reference).toMatch(/^DLV-/);
    expect(delivery.trackingReference).toMatch(/^TRK-/);
    expect(delivery.provider).toBe("sandbox");
    expect(delivery.status).toBe("ASSIGNED");
    expect(delivery.statusLabel).toBe("Assigned to courier");
    // Metro base for a Lagos area drop: ₦3,000, computed server-side.
    expect(delivery.feeNaira).toBe(3_000);
    expect(delivery.feeBreakdown).toEqual([
      { label: "Base delivery (metropolitan)", amountNaira: 3_000 },
    ]);
    expect(delivery.dropLocation).toBe("Ikeja G.R.A, Lagos");
    expect(delivery.allowedTransitions).toEqual(["PICKED_UP", "FAILED", "CANCELLED"]);
    expect(delivery.events).toHaveLength(1);
    expect(delivery.events[0].cause).toBe("created");
    expect(delivery.events[0].toStatus).toBe("ASSIGNED");
    expect(new Date(delivery.eta).getTime()).toBeGreaterThan(Date.now());
  });

  it("defaults the drop location to the request location", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryCreateRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery`, {}),
      params(requestId),
    );
    const json = await res.json();
    expect(json.data.delivery.dropLocation).toBe("Ikeja");
  });

  it("stores express priority and caller pickup/notes", async () => {
    const { requestId } = await seedPaidRequest("Kano");
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryCreateRoute(
      makePost(
        operator.req,
        `/api/operations/requests/${requestId}/delivery`,
        { priority: "EXPRESS", pickup: "Warehouse 4", notes: "Handle with care" },
      ),
      params(requestId),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const delivery = json.data.delivery;
    expect(delivery.feeNaira).toBe(7_500); // ₦5,000 base + 50% surcharge
    expect(delivery.pickup).toBe("Warehouse 4");
    expect(delivery.notes).toBe("Handle with care");
  });

  it("rejects a second delivery for the same request", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    const path = `/api/operations/requests/${requestId}/delivery`;

    const first = await deliveryCreateRoute(
      makePost(operator.req, path, {}),
      params(requestId),
    );
    expect(first.status).toBe(200);

    const second = await deliveryCreateRoute(
      makePost(operator.req, path, {}),
      params(requestId),
    );
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.error.code).toBe("DUPLICATE_DELIVERY");
  });

  it("rejects a bogus priority with a field error", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryCreateRoute(
      makePost(
        operator.req,
        `/api/operations/requests/${requestId}/delivery`,
        { priority: "LIGHTNING" },
      ),
      params(requestId),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.fieldErrors.priority).toBeDefined();
  });
});

describe("POST /api/operations/requests/[id]/delivery/status", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  async function createDelivery(requestId: string, operator: Awaited<ReturnType<typeof createOperatorAndCollectCookies>>) {
    const created = await deliveryCreateRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery`, {}),
      params(requestId),
    );
    const json = await created.json();
    return json.data.delivery;
  }

  it("advances through the lifecycle and captures proof on delivery", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    await createDelivery(requestId, operator);
    const basePath = `/api/operations/requests/${requestId}/delivery/status`;

    for (const status of ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"]) {
      const res = await deliveryStatusRoute(
        makePost(operator.req, basePath, { status }),
        params(requestId),
      );
      expect(res.status, status).toBe(200);
    }

    const delivered = await deliveryStatusRoute(
      makePost(operator.req, basePath, {
        status: "DELIVERED",
        recipientName: "Emeka",
        proofType: "confirmation_code",
        proofReference: "TRK-00012",
      }),
      params(requestId),
    );
    expect(delivered.status).toBe(200);
    const json = await delivered.json();
    const view = json.data.delivery;

    expect(view.status).toBe("DELIVERED");
    expect(view.recipientName).toBe("Emeka");
    expect(view.proofReference).toBe("TRK-00012");
    expect(view.proofType).toBe("confirmation_code");
    expect(view.deliveredAt).not.toBeNull();
    expect(view.allowedTransitions).toEqual([]);
    expect(view.events).toHaveLength(5);
    expect(view.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "ASSIGNED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(view.events[4].details).toContain("Emeka");
    expect(view.events[4].details).toContain("TRK-00012");

    // The serialized view is a snapshot of the audit trail; nothing more to do.
    const dbRow = await prisma.delivery.findUnique({
      where: { requestId },
      select: { id: true, status: true, deliveredAt: true },
    });
    expect(dbRow).not.toBeNull();
  });

  it("rejects guarded transitions", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    await createDelivery(requestId, operator);
    const basePath = `/api/operations/requests/${requestId}/delivery/status`;

    const res = await deliveryStatusRoute(
      makePost(operator.req, basePath, { status: "DELIVERED" }),
      params(requestId),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns 404 when the request has no delivery", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    const res = await deliveryStatusRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery/status`, {
        status: "PICKED_UP",
      }),
      params(requestId),
    );
    expect(res.status).toBe(404);
  });

  it("rejects an unknown status value", async () => {
    const { requestId } = await seedPaidRequest("Ikeja");
    const operator = await createOperatorAndCollectCookies();
    await createDelivery(requestId, operator);
    const res = await deliveryStatusRoute(
      makePost(operator.req, `/api/operations/requests/${requestId}/delivery/status`, {
        status: "LOST",
      }),
      params(requestId),
    );
    expect(res.status).toBe(422);
  });
});