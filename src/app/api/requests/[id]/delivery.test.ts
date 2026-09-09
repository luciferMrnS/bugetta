import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  ORIGIN,
  PASSWORD,
  adoptCookies,
  createOperatorAndCollectCookies,
  makeLogin,
  registerAndCollectCookies,
  resetDatabase,
} from "@/lib/test/http";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { createDeliveryForRequest } from "@/lib/delivery/service";
import { GET as trackerRoute } from "@/app/api/requests/[id]/delivery/route";

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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

let seedCounter = 0;

async function registerCustomer() {
  seedCounter += 1;
  const email = `tracker-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "Tracker Customer",
      role: ROLES.CUSTOMER,
    },
  });
  return user;
}

// Signs in as an arbitrary existing user (the test's owner), returning a
// request that carries their session and the plaintext CSRF token.
async function loginAs(email: string): Promise<NextRequest> {
  const req = makeLogin(email, PASSWORD);
  const res = await loginRoute(req);
  adoptCookies(req, res);
  return req;
}

async function seedPaidRequest(customerId: string) {
  const request = await prisma.request.create({
    data: {
      reference: `TRK-REQ-${seedCounter}-${Date.now()}`,
      customerId,
      category: "FOOD",
      summary: "Tracked delivery",
      description: "Seed request for customer tracking.",
      location: "Ikeja",
      status: "PAID",
    },
  });
  return request;
}

describe("GET /api/requests/[id]/delivery", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("requires a signed-in customer and reports null when delivery is pending", async () => {
    const owner = await registerCustomer();
    const request = await seedPaidRequest(owner.id);

    const anon = await trackerRoute(
      makeGet(null, `/api/requests/${request.id}/delivery`),
      params(request.id),
    );
    expect(anon.status).toBe(401);

    const ownerSession = await loginAs(owner.email);
    const res = await trackerRoute(
      makeGet(ownerSession, `/api/requests/${request.id}/delivery`),
      params(request.id),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.delivery).toBeNull();
  });

  it("hides the tracker from customers who do not own the request", async () => {
    const owner = await registerCustomer();
    const request = await seedPaidRequest(owner.id);
    const outsider = await registerAndCollectCookies();
    const res = await trackerRoute(
      makeGet(outsider.req, `/api/requests/${request.id}/delivery`),
      params(request.id),
    );
    expect(res.status).toBe(404);
  });

  it("exposes tracking-safe fields only, never fees", async () => {
    const owner = await registerCustomer();
    const request = await seedPaidRequest(owner.id);
    const operator = await createOperatorAndCollectCookies();
    await createDeliveryForRequest({
      requestId: request.id,
      operatorUserId: operator.req.cookies.get("bugetta_session")?.value ?? "",
      operatorRole: "OPERATIONS",
      dropLocation: "Ikeja",
      priority: "STANDARD",
    });

    const ownerSession = await loginAs(owner.email);
    const res = await trackerRoute(
      makeGet(ownerSession, `/api/requests/${request.id}/delivery`),
      params(request.id),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const tracker = json.data.delivery;

    expect(tracker.reference).toMatch(/^DLV-/);
    expect(tracker.providerLabel).toBe("Bugetta delivery (sandbox)");
    expect(tracker.status).toBe("ASSIGNED");
    expect(tracker.dropLocation).toBe("Ikeja");
    expect(Array.isArray(tracker.events)).toBe(true);
    expect(tracker.events).toHaveLength(1);
    expect("feeNaira" in tracker).toBe(false);
    expect("trackingReference" in tracker).toBe(false);
    expect("notes" in tracker).toBe(false);
    expect("provider" in tracker).toBe(false);
  });

  it("shows proof of delivery to the owner once delivered", async () => {
    const owner = await registerCustomer();
    const request = await seedPaidRequest(owner.id);
    const service = await createDeliveryForRequest({
      requestId: request.id,
      operatorUserId: "ops-user",
      operatorRole: "OPERATIONS",
      dropLocation: "Ikeja",
    });
    await prisma.delivery.update({
      where: { id: service.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        recipientName: "Emeka",
        proofType: "photograph",
      },
    });
    await prisma.deliveryEvent.create({
      data: {
        deliveryId: service.id,
        fromStatus: "ASSIGNED",
        toStatus: "DELIVERED",
        cause: "operator",
        details: "Delivered to Emeka.",
      },
    });

    const ownerSession = await loginAs(owner.email);
    const res = await trackerRoute(
      makeGet(ownerSession, `/api/requests/${request.id}/delivery`),
      params(request.id),
    );
    const json = await res.json();
    const tracker = json.data.delivery;
    expect(tracker.status).toBe("DELIVERED");
    expect(tracker.deliveredAt).not.toBeNull();
    expect(tracker.recipientName).toBe("Emeka");
    expect(tracker.proofType).toBe("photograph");
  });
});