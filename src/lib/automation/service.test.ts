import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { resetDatabase, PASSWORD } from "@/lib/test/http";
import { runAutomation } from "@/lib/automation/service";

async function makeUser(role: string, email: string): Promise<string> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: "Automation Test",
      role,
    },
  });
  return user.id;
}

async function makeApprovedSupplier(categories: string[]): Promise<{
  supplierId: string;
  userId: string;
}> {
  const userId = await makeUser(ROLES.SUPPLIER, `auto-supplier-${Date.now()}-${Math.random()}@example.com`);
  const supplier = await prisma.supplier.create({
    data: {
      userId,
      businessName: "Auto Supply Co",
      contactName: "Ade",
      supplierCategories: {
        create: categories.map((categoryKey) => ({ categoryKey })),
      },
      status: "APPROVED",
      serviceArea: "Lagos",
    },
  });
  return { supplierId: supplier.id, userId };
}

async function makeOffering(
  supplierId: string,
  title: string,
  category: string,
): Promise<void> {
  await prisma.offering.create({
    data: {
      supplierId,
      category,
      title,
      priceKobo: 600000,
      currency: "NGN",
      availability: "in stock",
      location: "Lagos",
      images: "[]",
      isActive: true,
    },
  });
}

async function makeRequest(customerUserId: string, category: string): Promise<string> {
  const request = await prisma.request.create({
    data: {
      reference: `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: customerUserId,
      category,
      summary: "Catering for a corporate lunch",
      description: "Catering for 60 people, delivered to Victoria Island",
      budgetKobo: 15000000,
      location: "Lekki, Lagos",
      status: "REQUESTED",
      items: { create: [{ name: "Catering", quantity: "60" }] },
    },
  });
  return request.id;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("runAutomation — REQUEST_CREATED", () => {
  it("acknowledges the customer but does not auto-generate options (manual ops only)", async () => {
    const customerId = await makeUser(ROLES.CUSTOMER, "customer@example.com");
    const supplierA = await makeApprovedSupplier(["FOOD"]);
    await makeOffering(supplierA.supplierId, "Party catering pack", "FOOD");
    const requestId = await makeRequest(customerId, "FOOD");

    const run = await runAutomation({ trigger: "REQUEST_CREATED", requestId });

    expect(run.status).toBe("COMPLETED");
    expect(run.trigger).toBe("REQUEST_CREATED");
    expect(run.reference).toMatch(/^AUTO-/);

    // The customer is acknowledged...
    const actions = run.results.map((r) => r.action);
    expect(actions).toEqual(["notify.customer"]);
    const customerNotifications = await prisma.notification.count({
      where: { userId: customerId, kind: "REQUEST_CREATED" },
    });
    expect(customerNotifications).toBeGreaterThanOrEqual(1);

    // ...but no supplier leads, assignments, or auto-quotes are produced.
    const supplierNotifications = await prisma.notification.count({
      where: { kind: "SUPPLIER_LEAD" },
    });
    expect(supplierNotifications).toBe(0);
    expect(await prisma.quote.count({ where: { requestId, source: "AUTO" } })).toBe(0);
    expect(
      await prisma.supplierRequest.count({ where: { requestId } }),
    ).toBe(0);
  });

  it("is idempotent per request — a second run is SKIPPED", async () => {
    const customerId = await makeUser(ROLES.CUSTOMER, "customer2@example.com");
    const requestId = await makeRequest(customerId, "FOOD");

    await runAutomation({ trigger: "REQUEST_CREATED", requestId });
    const skipped = await runAutomation({ trigger: "REQUEST_CREATED", requestId });

    expect(skipped.status).toBe("SKIPPED");
    expect(skipped.summary).toContain("already executed");
  });

  it("records failures as FAILED runs instead of throwing", async () => {
    const failed = await runAutomation({
      trigger: "LOW_STOCK",
      supplierId: null,
      offeringId: null,
    });

    expect(failed.status).toBe("FAILED");
    expect(failed.error).not.toBeNull();
    expect(failed.reference).toMatch(/^AUTO-/);
  });
});

describe("runAutomation — PAYMENT_PAID", () => {
  it("notifies customer and assigned supplier when order is paid", async () => {
    const customerId = await makeUser(ROLES.CUSTOMER, "customer-pay@example.com");
    const supplier = await makeApprovedSupplier(["FOOD"]);
    const requestId = await makeRequest(customerId, "FOOD");

    await prisma.supplierRequest.create({
      data: {
        requestId,
        supplierId: supplier.supplierId,
        status: "ASSIGNED",
      },
    });

    const run = await runAutomation({ trigger: "PAYMENT_PAID", requestId });

    expect(run.status).toBe("COMPLETED");
    const kinds = (await prisma.notification.findMany({
      where: {
        userId: customerId,
        kind: { in: ["PAYMENT_PAID", "ORDER_PROCESSING"] },
      },
      select: { kind: true },
    })).map((n) => n.kind);
    expect(kinds).toContain("PAYMENT_PAID");

    const supplierKinds = (await prisma.notification.findMany({
      where: {
        userId: supplier.userId,
        kind: { in: ["PAYMENT_PAID", "ORDER_PROCESSING"] },
      },
      select: { kind: true },
    })).map((n) => n.kind);
    expect(supplierKinds).toContain("ORDER_PROCESSING");
  });
});

describe("runAutomation — LOW_STOCK", () => {
  it("notifies the supplier who owns the offering", async () => {
    const supplier = await makeApprovedSupplier(["GROCERIES"]);
    const offering = await prisma.offering.create({
      data: {
        supplierId: supplier.supplierId,
        category: "GROCERIES",
        title: "Tinned tomatoes",
        priceKobo: 350000,
        currency: "NGN",
        images: "[]",
        isActive: true,
        quantityAvailable: 3,
      },
    });

    const run = await runAutomation({
      trigger: "LOW_STOCK",
      supplierId: supplier.supplierId,
      offeringId: offering.id,
    });

    expect(run.status).toBe("COMPLETED");
    const notifications = await prisma.notification.findMany({
      where: { userId: supplier.userId, kind: "LOW_STOCK", reference: offering.id },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].body).toContain("3");
  });
});