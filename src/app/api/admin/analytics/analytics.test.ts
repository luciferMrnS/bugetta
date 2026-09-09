import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  ORIGIN,
  PASSWORD,
  createAdminAndCollectCookies,
  createOperatorAndCollectCookies,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
} from "@/lib/test/http";
import { GET as analyticsRoute } from "@/app/api/admin/analytics/route";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeRead(
  session: NextRequest | null,
  path: string,
): NextRequest {
  const req = new NextRequest(`${ORIGIN}${path}`, {
    method: "GET",
    headers: { "x-forwarded-for": nextClientIp() },
  });
  if (session) {
    copyCookies(session, req);
  }
  return req;
}

interface UnmetExampleWire {
  requestReference: string;
  statusLabel: string;
  categoryLabel: string;
  budgetNaira: number | null;
}

let seedCounter = 0;
const DAY = 86_400_000;
const NOW = new Date();

async function createUser(role: string, createdAt?: Date) {
  seedCounter += 1;
  return prisma.user.create({
    data: {
      email: `analytics-${role}-${seedCounter}-${incrementTestCounter()}-${Date.now()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      name: `Analytics ${role}`,
      role,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function createRequest(input: {
  customerId: string;
  category: string;
  summary: string;
  status?: string;
  budgetKobo?: number;
  createdAt?: Date;
  items?: string[];
}) {
  seedCounter += 1;
  const request = await prisma.request.create({
    data: {
      reference: `AN-REQ-${seedCounter}-${Date.now()}`,
      customerId: input.customerId,
      category: input.category,
      summary: input.summary,
      description: `${input.summary} — seeded for analytics.`,
      status: input.status ?? "REQUESTED",
      budgetKobo: input.budgetKobo,
      location: "Ikeja",
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
  for (const name of input.items ?? []) {
    await prisma.requestItem.create({
      data: { requestId: request.id, name, quantity: null, note: null },
    });
  }
  return request;
}

async function capturePayment(input: {
  requestId: string;
  customerId: string;
  amountKobo: number;
  paidAt: Date;
}) {
  seedCounter += 1;
  return prisma.payment.create({
    data: {
      requestId: input.requestId,
      customerId: input.customerId,
      reference: `AN-PAY-${seedCounter}-${Date.now()}`,
      provider: "sandbox",
      providerReference: `SBOX-AN-${seedCounter}-${Date.now()}`,
      amountKobo: input.amountKobo,
      currency: "NGN",
      status: "PAID",
      providerStatus: "paid",
      paidAt: input.paidAt,
      createdAt: input.paidAt,
    },
  });
}

async function refundPayment(paymentId: string, amountKobo: number) {
  seedCounter += 1;
  return prisma.refund.create({
    data: {
      paymentId,
      amountKobo,
      reason: "Analytics test refund",
      createdById: "analytics-fixture",
      status: "PROCESSED",
      reference: `AN-RFD-${seedCounter}-${Date.now()}`,
    },
  });
}

async function approveSupplier(categories: string[]) {
  seedCounter += 1;
  const user = await createUser(ROLES.SUPPLIER);
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: `Analytics Supplies ${seedCounter}`,
      contactName: "Analytics Supplier",
      supplierCategories: {
        create: categories.map((categoryKey) => ({ categoryKey })),
      },
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  return { user, supplier };
}

beforeEach(async () => {
  incrementTestCounter();
  await resetDatabase();
  seedCounter = 0;
});

describe("GET /api/admin/analytics", () => {
  it("requires an admin (anon 401, customer 403, ops 403)", async () => {
    const anon = await analyticsRoute(makeRead(null, "/api/admin/analytics"));
    expect(anon.status).toBe(401);

    const customer = await registerAndCollectCookies();
    const customerRes = await analyticsRoute(
      makeRead(customer.req, "/api/admin/analytics"),
    );
    expect(customerRes.status).toBe(403);

    const ops = await createOperatorAndCollectCookies();
    const opsRes = await analyticsRoute(makeRead(ops.req, "/api/admin/analytics"));
    expect(opsRes.status).toBe(403);
  });

  it("validates the days query parameter", async () => {
    const admin = await createAdminAndCollectCookies();
    const res = await analyticsRoute(
      makeRead(admin.req, "/api/admin/analytics?days=abc"),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error?.code).toBe("VALIDATION_ERROR");

    const zero = await analyticsRoute(
      makeRead(admin.req, "/api/admin/analytics?days=0"),
    );
    expect(zero.status).toBe(422);

    const capped = await analyticsRoute(
      makeRead(admin.req, "/api/admin/analytics?days=10000"),
    );
    expect(capped.status).toBe(422);
  });

  it("returns an empty zeroed dashboard when there is no data", async () => {
    const admin = await createAdminAndCollectCookies();
    const res = await analyticsRoute(
      makeRead(admin.req, "/api/admin/analytics?days=30"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    expect(body.window.days).toBe(30);
    expect(body.summary.requests.total).toBe(0);
    expect(body.summary.requests.perDay).toBe(0);
    expect(body.summary.conversionRate).toBe(0);
    expect(body.summary.averageOrderValueNaira).toBe(0);
    expect(body.summary.revenue.grossNaira).toBe(0);
    expect(body.summary.revenue.grossMarginRate).toBe(0);
    expect(body.summary.cancellationRate).toBe(0);
    expect(body.summary.averageFulfillmentHours).toBe(0);
    expect(body.requestsPerDay).toHaveLength(30);
    expect(body.categoryDemand).toEqual([]);
    expect(body.supplierPerformance).toEqual([]);
    expect(body.unmetDemand.totalRequests).toBe(0);
    expect(body.unmetDemand.budgetNaira).toBe(0);
  });

  it("computes the full metrics from a seeded ledger", async () => {
    // Users: A, B, C, D sign up today; E signed up 40 days ago (outside window).
    const a = await createUser(ROLES.CUSTOMER, new Date(NOW.getTime() - 60_000));
    const b = await createUser(ROLES.CUSTOMER, new Date(NOW.getTime() - 90_000));
    const c = await createUser(ROLES.CUSTOMER, new Date(NOW.getTime() - 120_000));
    const d = await createUser(ROLES.CUSTOMER, new Date(NOW.getTime() - 150_000));
    const e = await createUser(
      ROLES.CUSTOMER,
      new Date(NOW.getTime() - 40 * DAY),
    );

    // Supplier covers FOOD (supply exists); ELECTRONICS has no approved supplier.
    const { supplier } = await approveSupplier(["FOOD"]);

    const day0 = (hour: number) =>
      new Date(`${NOW.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00.000Z`);
    // But if "now" is earlier in the day, cap seeding to the current moment.
    const capped = (date: Date) => (date.getTime() > NOW.getTime() ? NOW : date);

    const r1 = await createRequest({
      customerId: a.id,
      category: "FOOD",
      summary: "Grilled chicken platter",
      status: "PAID",
      createdAt: capped(day0(10)),
    });
    await capturePayment({
      requestId: r1.id,
      customerId: a.id,
      amountKobo: 10_000_00,
      paidAt: capped(new Date(day0(10).getTime() + 60_000)),
    });

    const r2 = await createRequest({
      customerId: a.id,
      category: "FOOD",
      summary: "Birthday cake, 3 tiers",
      status: "PAID",
      createdAt: capped(day0(11)),
    });
    const r2Payment = await capturePayment({
      requestId: r2.id,
      customerId: a.id,
      amountKobo: 5_000_00,
      paidAt: capped(new Date(day0(11).getTime() + 60_000)),
    });
    await refundPayment(r2Payment.id, 5_000_00);

    const r3 = await createRequest({
      customerId: c.id,
      category: "ELECTRONICS",
      summary: "Laptop charger for a MacBook",
      status: "CANCELLED",
      budgetKobo: 40_000_00,
      createdAt: capped(day0(12)),
      items: ["laptop charger"],
    });

    const r4 = await createRequest({
      customerId: c.id,
      category: "FOOD",
      summary: "Snacks for a birthday party",
      budgetKobo: 7_500_00,
      createdAt: capped(day0(13)),
      items: ["party snacks"],
    });

    // Two days ago: another captured order fulfilled in 2 hours.
    const d2 = new Date(NOW.getTime() - 2 * DAY);
    const r5 = await createRequest({
      customerId: b.id,
      category: "FASHION",
      summary: "Ankara dress, made to measure",
      status: "PAID",
      createdAt: new Date(`${d2.toISOString().slice(0, 10)}T08:00:00.000Z`),
    });
    await capturePayment({
      requestId: r5.id,
      customerId: b.id,
      amountKobo: 2_000_00,
      paidAt: new Date(`${d2.toISOString().slice(0, 10)}T09:00:00.000Z`),
    });
    await prisma.supplierRequest.create({
      data: {
        requestId: r5.id,
        supplierId: supplier.id,
        status: "ACCEPTED",
        fulfilledAt: new Date(`${d2.toISOString().slice(0, 10)}T10:00:00.000Z`),
      },
    });
    await prisma.supplierEarning.create({
      data: { supplierId: supplier.id, requestId: r5.id, amountKobo: 1_800_00 },
    });
    await prisma.rating.create({
      data: { requestId: r5.id, supplierId: supplier.id, customerId: b.id, score: 5 },
    });

    // Five days ago: a faster fulfilment for a different customer.
    const d5 = new Date(NOW.getTime() - 5 * DAY);
    const r6 = await createRequest({
      customerId: d.id,
      category: "FASHION",
      summary: "Pair of sneakers",
      status: "PAID",
      createdAt: new Date(`${d5.toISOString().slice(0, 10)}T08:00:00.000Z`),
    });
    await capturePayment({
      requestId: r6.id,
      customerId: d.id,
      amountKobo: 1_500_00,
      paidAt: new Date(`${d5.toISOString().slice(0, 10)}T09:00:00.000Z`),
    });
    await prisma.supplierRequest.create({
      data: {
        requestId: r6.id,
        supplierId: supplier.id,
        status: "ACCEPTED",
        fulfilledAt: new Date(`${d5.toISOString().slice(0, 10)}T09:30:00.000Z`),
      },
    });
    await prisma.supplierEarning.create({
      data: { supplierId: supplier.id, requestId: r6.id, amountKobo: 1_200_00 },
    });
    await prisma.rating.create({
      data: { requestId: r6.id, supplierId: supplier.id, customerId: d.id, score: 4 },
    });

    // Outside the window: must not contribute to any in-window metric.
    const r7 = await createRequest({
      customerId: e.id,
      category: "GROCERIES",
      summary: "Monthly provisions",
      status: "PAID",
      createdAt: new Date(NOW.getTime() - 40 * DAY),
    });
    await capturePayment({
      requestId: r7.id,
      customerId: e.id,
      amountKobo: 9_000_00,
      paidAt: new Date(NOW.getTime() - 39 * DAY),
    });

    // ── Exercise the route ─────────────────────────────────────────────────
    const admin = await createAdminAndCollectCookies();
    const res = await analyticsRoute(
      makeRead(admin.req, "/api/admin/analytics?days=30"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()).data;

    // Summary
    expect(body.summary.requests).toEqual({ total: 6, perDay: 0.2 });
    expect(body.summary.paidRequests).toBe(4);
    expect(body.summary.conversionRate).toBe(66.7);
    expect(body.summary.averageOrderValueNaira).toBe(4_625);
    expect(body.summary.revenue).toEqual({
      grossNaira: 18_500,
      refundsNaira: 5_000,
      netNaira: 13_500,
      supplierPayoutNaira: 3_000,
      grossMarginNaira: 15_500,
      grossMarginRate: 83.8,
    });
    expect(body.summary.cancellationRate).toBe(16.7);
    expect(body.summary.averageFulfillmentHours).toBe(1.8);
    expect(body.summary.fulfillmentCount).toBe(2);

    // Requests per day — today holds r1..r4, d2 holds r5, d5 holds r6.
    const today = NOW.toISOString().slice(0, 10);
    const todayPoint = body.requestsPerDay.find(
      (point: { date: string }) => point.date === today,
    );
    expect(todayPoint.requests).toBe(4);
    expect(todayPoint.paid).toBe(2);
    expect(todayPoint.newCustomers).toBe(4);
    const d2Point = body.requestsPerDay.find(
      (point: { date: string }) =>
        point.date === d2.toISOString().slice(0, 10),
    );
    expect(d2Point.requests).toBe(1);
    expect(d2Point.paid).toBe(1);
    const d5Point = body.requestsPerDay.find(
      (point: { date: string }) =>
        point.date === d5.toISOString().slice(0, 10),
    );
    expect(d5Point.requests).toBe(1);
    expect(d5Point.paid).toBe(1);
    expect(body.requestsPerDay).toHaveLength(30);

    // Category demand (sorted by revenue desc).
    expect(body.categoryDemand).toEqual([
      {
        category: "FOOD",
        label: "Food & Drinks",
        requests: 3,
        paid: 2,
        cancelled: 0,
        open: 1,
        conversionRate: 66.7,
        revenueNaira: 15_000,
      },
      {
        category: "FASHION",
        label: "Fashion & Clothing",
        requests: 2,
        paid: 2,
        cancelled: 0,
        open: 0,
        conversionRate: 100,
        revenueNaira: 3_500,
      },
      {
        category: "ELECTRONICS",
        label: "Electronics & Gadgets",
        requests: 1,
        paid: 0,
        cancelled: 1,
        open: 0,
        conversionRate: 0,
        revenueNaira: 0,
      },
    ]);

    // Supplier performance.
    expect(body.supplierPerformance).toHaveLength(1);
    const supplierRow = body.supplierPerformance[0];
    expect(supplierRow.businessName).toMatch(/^Analytics Supplies/);
    expect(supplierRow.completed).toBe(2);
    expect(supplierRow.earnedNaira).toBe(3_000);
    expect(supplierRow.avgRating).toBe(4.5);
    expect(supplierRow.reliabilityScore).toBeGreaterThanOrEqual(0);

    // Customers.
    expect(body.customers).toEqual({
      payingCustomers: 3,
      oneTimeCustomers: 2,
      repeatCustomers: 1,
      repeatPurchaseRate: 33.3,
      newUsers: 4,
      newBuyers: 3,
      buyerConversionRate: 75,
    });

    // Unmet demand: nothing unpaid converts; budgets restated in naira.
    expect(body.unmetDemand.totalRequests).toBe(2);
    expect(body.unmetDemand.budgetNaira).toBe(47_500);
    expect(body.unmetDemand.byCategory).toEqual([
      {
        category: "ELECTRONICS",
        label: "Electronics & Gadgets",
        cancelled: 1,
        open: 0,
        total: 1,
        budgetNaira: 40_000,
        activeSuppliers: 0,
      },
      {
        category: "FOOD",
        label: "Food & Drinks",
        cancelled: 0,
        open: 1,
        total: 1,
        budgetNaira: 7_500,
        activeSuppliers: 1,
      },
    ]);
    expect(body.unmetDemand.topItems).toEqual([
      { item: "laptop charger", count: 1 },
      { item: "party snacks", count: 1 },
    ]);

    const examplesByRef = new Map<
      string,
      { statusLabel: string; categoryLabel: string; budgetNaira: number | null }
    >(
      body.unmetDemand.examples.map((example: UnmetExampleWire) => [
        example.requestReference,
        example,
      ]),
    );
    expect(body.unmetDemand.examples).toHaveLength(2);

    const r4Example = examplesByRef.get(r4.reference);
    expect(r4Example).toBeDefined();
    expect(r4Example!.statusLabel).toBe("Requested");
    expect(r4Example!.categoryLabel).toBe("Food & Drinks");
    expect(r4Example!.budgetNaira).toBe(7_500);

    const r3Example = examplesByRef.get(r3.reference);
    expect(r3Example).toBeDefined();
    expect(r3Example!.statusLabel).toBe("Cancelled");
    expect(r3Example!.categoryLabel).toBe("Electronics & Gadgets");
    expect(r3Example!.budgetNaira).toBe(40_000);
  });
});