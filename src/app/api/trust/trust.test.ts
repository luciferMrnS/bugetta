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
  createAdminAndCollectCookies,
  createOperatorAndCollectCookies,
  makeLogin,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as ratingsGetRoute } from "@/app/api/requests/[id]/ratings/route";
import { POST as ratingsPostRoute } from "@/app/api/requests/[id]/ratings/route";
import { GET as disputeGetRoute } from "@/app/api/requests/[id]/dispute/route";
import { POST as raiseDisputeRoute } from "@/app/api/requests/[id]/disputes/route";
import { POST as raiseComplaintRoute } from "@/app/api/requests/[id]/complaints/route";
import { GET as supplierRatingsRoute } from "@/app/api/suppliers/ratings/route";
import { GET as customerHistoryRoute } from "@/app/api/account/transactions/route";
import { GET as supplierHistoryRoute } from "@/app/api/suppliers/transactions/route";
import { GET as trustDashboardRoute } from "@/app/api/operations/trust/dashboard/route";
import { POST as resolveDisputeRoute } from "@/app/api/admin/trust/disputes/[id]/route";
import { POST as resolveComplaintRoute } from "@/app/api/admin/trust/complaints/[id]/route";
import { POST as reviewFlagRoute } from "@/app/api/admin/trust/flags/[id]/route";
import { supplierReliability } from "@/lib/trust/scores";
import { REQUEST_STATUS } from "@/lib/requests/status";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

// The CSRF token for a session is carried as the bugetta_csrf cookie (the same
// plaintext value the client mirrors into the x-csrf-token header on POSTs).
function csrfOf(session: NextRequest): string {
  return session.cookies.get("bugetta_csrf")?.value ?? "";
}

let seedCounter = 0;

async function registerCustomer() {
  seedCounter += 1;
  const email = `trust-customer-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`;
  return prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "Trust Customer",
      role: ROLES.CUSTOMER,
    },
  });
}

async function loginAs(email: string): Promise<NextRequest> {
  const req = makeLogin(email, PASSWORD);
  const res = await loginRoute(req);
  adoptCookies(req, res);
  return req;
}

async function createSupplier() {
  seedCounter += 1;
  const email = `trust-supplier-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      name: "Trust Supplier",
      role: ROLES.SUPPLIER,
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: `Trust Supplies ${seedCounter}`,
      contactName: "Trust Supplier",
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  return { user, supplier };
}

// A paid request assigned to a supplier (money moved, in an eligible state).
async function seedPaidRequest(input: {
  customerId: string;
  supplierId: string;
  status?: string;
}) {
  seedCounter += 1;
  const request = await prisma.request.create({
    data: {
      reference: `TR-REQ-${seedCounter}-${Date.now()}`,
      customerId: input.customerId,
      category: "FOOD",
      summary: "Trust seeding order",
      description: "Seeded paid request for trust tests.",
      location: "Ikeja",
      status: input.status ?? "PAID",
    },
  });
  await prisma.payment.create({
    data: {
      requestId: request.id,
      customerId: input.customerId,
      reference: `TR-PAY-${seedCounter}-${Date.now()}`,
      provider: "sandbox",
      providerReference: `SBOX-TR-${seedCounter}-${Date.now()}`,
      amountKobo: 12_000_00,
      currency: "NGN",
      status: input.status === "CANCELLED" ? "FAILED" : "PAID",
      providerStatus: input.status === "CANCELLED" ? "declined" : "paid",
      paidAt: new Date(),
    },
  });
  await prisma.supplierRequest.create({
    data: {
      requestId: request.id,
      supplierId: input.supplierId,
      status: "ACCEPTED",
      fulfilledAt: new Date(Date.now() - 60_000),
    },
  });
  return request;
}

describe("customer ratings", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("requires a signed-in customer and rejects unassigned suppliers", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });

    const anon = await ratingsPostRoute(
      makeApiRequest(new NextRequest(`${ORIGIN}/api`), "", `/api/requests/${request.id}/ratings`, "POST", {
        supplierId: supplier.id,
        score: 5,
      }),
      params(request.id),
    );
    expect(anon.status).toBe(401);

    const session = await loginAs(customer.email);
    const otherSupplier = await createSupplier();
    const res = await ratingsPostRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/ratings`, "POST", {
        supplierId: otherSupplier.supplier.id,
        score: 5,
      }),
      params(request.id),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error?.code).toBe("NOT_ASSIGNED");
  });

  it("rejects out-of-range scores and before fulfilment starts", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);

    const badScore = await ratingsPostRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/ratings`, "POST", {
        supplierId: supplier.id,
        score: 6,
      }),
      params(request.id),
    );
    expect(badScore.status).toBe(422);

    const pendingRequest = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
      status: "REQUESTED",
    });
    const early = await ratingsPostRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${pendingRequest.id}/ratings`, "POST", {
        supplierId: supplier.id,
        score: 5,
      }),
      params(pendingRequest.id),
    );
    expect(early.status).toBe(409);
    const json = await early.json();
    expect(json.error?.code).toBe("NOT_RATEABLE");
  });

  it("upserts to exactly one rating per (request, supplier, customer)", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);

    const first = await ratingsPostRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/ratings`, "POST", {
        supplierId: supplier.id,
        score: 4,
        comment: "Solid work.",
      }),
      params(request.id),
    );
    expect(first.status).toBe(200);

    const second = await ratingsPostRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/ratings`, "POST", {
        supplierId: supplier.id,
        score: 5,
        comment: "Actually, excellent.",
      }),
      params(request.id),
    );
    expect(second.status).toBe(200);

    const count = await prisma.rating.count({
      where: { requestId: request.id, customerId: customer.id },
    });
    expect(count).toBe(1);
    const latest = await prisma.rating.findFirstOrThrow({
      where: { requestId: request.id },
    });
    expect(latest.score).toBe(5);

    const view = await ratingsGetRoute(
      makeApiRequest(session, "", `/api/requests/${request.id}/ratings`, "GET"),
      params(request.id),
    );
    const json = await view.json();
    expect(json.data?.eligible).toBe(true);
    expect(json.data?.suppliers[0].businessName).toBe(supplier.businessName);
    expect(json.data?.suppliers[0].rating.score).toBe(5);
  });

  it("hides another customer's ratings and ignores them on the supplier side", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const outsider = await registerAndCollectCookies();
    const read = await ratingsGetRoute(
      makeApiRequest(outsider.req, "", `/api/requests/${request.id}/ratings`, "GET"),
      params(request.id),
    );
    expect(read.status).toBe(404);

    const notSupplier = await registerAndCollectCookies();
    const supplierView = await supplierRatingsRoute(
      makeApiRequest(notSupplier.req, "", "/api/suppliers/ratings", "GET"),
    );
    expect(supplierView.status).toBe(403);
  });
});

describe("disputes", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("opens a dispute, moves the request to DISPUTED and flags the pattern", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);

    const res = await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "NOT_RECEIVED",
        description: "I paid three weeks ago and nothing was ever delivered.",
      }),
      params(request.id),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.dispute.status).toBe("OPEN");
    expect(json.data?.dispute.reason).toBe("NOT_RECEIVED");

    const moved = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(moved.status).toBe(REQUEST_STATUS.DISPUTED);

    const view = await disputeGetRoute(
      makeApiRequest(session, "", `/api/requests/${request.id}/dispute`, "GET"),
      params(request.id),
    );
    const viewJson = await view.json();
    expect(viewJson.data?.dispute.status).toBe("OPEN");
  });

  it("rejects duplicates, outsiders and non-disputable states", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);

    await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "QUALITY",
        description: "The product arrived broken and unusable.",
      }),
      params(request.id),
    );
    const dup = await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "QUALITY",
        description: "I want to raise this again for the record.",
      }),
      params(request.id),
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error?.code).toBe("DUPLICATE_DISPUTE");

    const other = await registerAndCollectCookies();
    const outsider = await raiseDisputeRoute(
      makeApiRequest(other.req, csrfOf(other.req), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "OTHER",
        description: "I am not the owner but let me try anyway.",
      }),
      params(request.id),
    );
    expect(outsider.status).toBe(404);

    const cancelled = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
      status: "CANCELLED",
    });
    const blocked = await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${cancelled.id}/disputes`, "POST", {
        reason: "OTHER",
        description: "This request should not be disputable.",
      }),
      params(cancelled.id),
    );
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error?.code).toBe("NOT_DISPUTABLE");
  });

  it("records a deterministic fraud flag once a customer has two open disputes", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const session = await loginAs(customer.email);

    for (let index = 0; index < 2; index += 1) {
      const request = await seedPaidRequest({
        customerId: customer.id,
        supplierId: supplier.id,
      });
      const res = await raiseDisputeRoute(
        makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
          reason: "NOT_RECEIVED",
          description: `Unreceived order number ${index}.`,
        }),
        params(request.id),
      );
      expect(res.status).toBe(200);
    }

    const flag = await prisma.fraudFlag.findUnique({
      where: {
        subjectType_subjectId_signal: {
          subjectType: "CUSTOMER",
          subjectId: customer.id,
          signal: "CUSTOMER_MULTIPLE_OPEN_DISPUTES",
        },
      },
    });
    expect(flag).not.toBeNull();
    expect(flag?.status).toBe("FLAGGED");
  });
});

describe("admin resolution", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("resolves a dispute with a full refund through the refund workflow", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);
    await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "BILLING",
        description: "I was charged twice for the same order.",
      }),
      params(request.id),
    );

    const admin = await createAdminAndCollectCookies();
    const dispute = await prisma.dispute.findFirstOrThrow({
      where: { requestId: request.id },
    });
    const resolved = await resolveDisputeRoute(
      makeApiRequest(admin.req, admin.csrf, `/api/admin/trust/disputes/${dispute.id}`, "POST", {
        decision: "REFUND",
        resolutionNote: "Charged in error, full refund.",
      }),
      params(dispute.id),
    );
    expect(resolved.status).toBe(200);
    const body = await resolved.json();
    expect(body.data?.dispute.status).toBe("RESOLVED_REFUND");
    expect(body.data?.dispute.refundReference).toMatch(/^RFD-/);

    const refreshed = await prisma.dispute.findUniqueOrThrow({
      where: { id: dispute.id },
    });
    expect(refreshed.status).toBe("RESOLVED_REFUND");
    expect(refreshed.refundReference).not.toBeNull();
    expect(refreshed.resolvedAt).not.toBeNull();

    const requestState = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(requestState.status).toBe(REQUEST_STATUS.REFUNDED);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { requestId: request.id },
    });
    expect(payment.status).toBe("REFUNDED");
    const refundCount = await prisma.refund.count({
      where: { paymentId: payment.id },
    });
    expect(refundCount).toBe(1);

    const twice = await resolveDisputeRoute(
      makeApiRequest(admin.req, admin.csrf, `/api/admin/trust/disputes/${dispute.id}`, "POST", {
        decision: "REFUND",
      }),
      params(dispute.id),
    );
    expect(twice.status).toBe(409);
    expect((await twice.json()).error?.code).toBe("ALREADY_RESOLVED");
  });

  it("resolves a dispute without a refund and returns the request to COMPLETED", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);
    await raiseDisputeRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/disputes`, "POST", {
        reason: "WHY_WRONG",
        description: "The delivery was correct, I withdraw this dispute.",
      }),
      params(request.id),
    );

    const admin = await createAdminAndCollectCookies();
    const dispute = await prisma.dispute.findFirstOrThrow({
      where: { requestId: request.id },
    });
    const res = await resolveDisputeRoute(
      makeApiRequest(admin.req, admin.csrf, `/api/admin/trust/disputes/${dispute.id}`, "POST", {
        decision: "NO_REFUND",
        resolutionNote: "Customer confirmed the order was correct.",
      }),
      params(dispute.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.dispute.status).toBe("RESOLVED_NO_REFUND");

    const requestState = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(requestState.status).toBe(REQUEST_STATUS.COMPLETED);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { requestId: request.id },
    });
    expect(payment.status).toBe("PAID");
  });

  it("lets operators view the trust dashboard but not resolve disputes", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    const session = await loginAs(customer.email);
    await raiseComplaintRoute(
      makeApiRequest(session, csrfOf(session), `/api/requests/${request.id}/complaints`, "POST", {
        subjectType: "SUPPLIER",
        subjectId: supplier.id,
        category: "COMMUNICATION",
        description: "The supplier never answered my calls about delivery.",
      }),
      params(request.id),
    );

    const ops = await createOperatorAndCollectCookies();
    const dash = await trustDashboardRoute(
      makeApiRequest(ops.req, "", "/api/operations/trust/dashboard", "GET"),
    );
    expect(dash.status).toBe(200);
    const json = await dash.json();
    expect(json.data?.summary.openComplaints).toBe(1);

    const dispute = await prisma.dispute.count();
    expect(dispute).toBe(0);

    const complaint = await prisma.complaint.findFirstOrThrow({
      where: { requestId: request.id },
    });
    const resolved = await resolveComplaintRoute(
      makeApiRequest(ops.req, ops.csrf, `/api/admin/trust/complaints/${complaint.id}`, "POST", {
        resolution: "Closed.",
      }),
      params(complaint.id),
    );
    expect(resolved.status).toBe(403);

    const admin = await createAdminAndCollectCookies();
    const done = await resolveComplaintRoute(
      makeApiRequest(admin.req, admin.csrf, `/api/admin/trust/complaints/${complaint.id}`, "POST", {
        resolution: "Reported supplier contacted; committed to faster replies.",
      }),
      params(complaint.id),
    );
    expect(done.status).toBe(200);
    const doneJson = await done.json();
    expect(doneJson.data?.complaint.status).toBe("RESOLVED");
  });

  it("reviews fraud flags (operator blocked, admin allowed)", async () => {
    const { supplier } = await createSupplier();
    const flag = await prisma.fraudFlag.create({
      data: {
        reference: `FLG-TEST-${Date.now()}`,
        subjectType: "SUPPLIER",
        subjectId: supplier.id,
        signal: "SUPPLIER_REPEATED_COMPLAINTS",
        severity: "MEDIUM",
        detail: "Test flag.",
        status: "FLAGGED",
      },
    });

    const ops = await createOperatorAndCollectCookies();
    const blocked = await reviewFlagRoute(
      makeApiRequest(ops.req, ops.csrf, `/api/admin/trust/flags/${flag.id}`, "POST", {
        status: "REVIEWED",
      }),
      params(flag.id),
    );
    expect(blocked.status).toBe(403);

    const admin = await createAdminAndCollectCookies();
    const reviewed = await reviewFlagRoute(
      makeApiRequest(admin.req, admin.csrf, `/api/admin/trust/flags/${flag.id}`, "POST", {
        status: "REVIEWED",
        note: "Reviewed, no action needed.",
      }),
      params(flag.id),
    );
    expect(reviewed.status).toBe(200);
    const body = await reviewed.json();
    expect(body.data?.flag.status).toBe("REVIEWED");
    expect(body.data?.flag.note).toBe("Reviewed, no action needed.");
  });
});

describe("transaction history", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("lists the customer's charges and refunds", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    await prisma.refund.create({
      data: {
        paymentId: (await prisma.payment.findFirstOrThrow({ where: { requestId: request.id } })).id,
        amountKobo: 12_000_00,
        reason: "Test refund",
        createdById: "system",
        reference: `RFD-TEST-${Date.now()}`,
      },
    });

    const session = await loginAs(customer.email);
    const res = await customerHistoryRoute(
      makeApiRequest(session, "", "/api/account/transactions", "GET"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const types = json.data?.transactions.map((tx: { type: string }) => tx.type);
    expect(types).toContain("CHARGE");
    expect(types).toContain("REFUND");
  });

  it("lists a supplier's earnings", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    await prisma.supplierEarning.create({
      data: {
        supplierId: supplier.id,
        requestId: request.id,
        amountKobo: 9_000_00,
        status: "EARNED",
      },
    });

    const supplierReq = await loginAs(
      (await prisma.user.findUniqueOrThrow({ where: { id: supplier.userId } })).email,
    );
    const res = await supplierHistoryRoute(
      makeApiRequest(supplierReq, "", "/api/suppliers/transactions", "GET"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data?.transactions[0].type).toBe("EARNING");
    expect(json.data?.transactions[0].amountNaira).toBe(9_000);
  });
});

describe("supplier reliability score", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
    seedCounter = 0;
  });

  it("awards a perfect reliability for a rated, on-time supplier", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "COMPLETED", deliveryDeadline: new Date(Date.now() + 24 * 3_600_000) },
    });
    await prisma.rating.create({
      data: {
        requestId: request.id,
        customerId: customer.id,
        supplierId: supplier.id,
        score: 5,
        comment: "Fantastic.",
      },
    });

    const reliability = await supplierReliability(supplier.id);
    expect(reliability.score).toBe(100);
    expect(reliability.components.onTimeRatio).toBe(100);
    expect(reliability.band).toBe("EXCELLENT");
  });

  it("penalises resolved-refund disputes", async () => {
    const customer = await registerCustomer();
    const { supplier } = await createSupplier();
    const request = await seedPaidRequest({
      customerId: customer.id,
      supplierId: supplier.id,
    });
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "COMPLETED", deliveryDeadline: new Date(Date.now() + 24 * 3_600_000) },
    });
    await prisma.rating.create({
      data: {
        requestId: request.id,
        customerId: customer.id,
        supplierId: supplier.id,
        score: 5,
      },
    });
    await prisma.dispute.create({
      data: {
        reference: `DSP-SCORE-${Date.now()}`,
        requestId: request.id,
        raisedById: customer.id,
        raisedByRole: "CUSTOMER",
        reason: "QUALITY",
        description: "Refunded after a quality dispute.",
        status: "RESOLVED_REFUND",
        resolvedById: "admin",
        resolvedAt: new Date(),
        refundReference: "RFD-SCORE",
      },
    });

    const reliability = await supplierReliability(supplier.id);
    expect(reliability.score).toBe(90);
    expect(reliability.components.disputePenalty).toBe(10);
  });
});