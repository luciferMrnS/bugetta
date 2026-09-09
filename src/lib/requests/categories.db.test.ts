import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { resetDatabase, PASSWORD } from "@/lib/test/http";

beforeEach(async () => {
  await resetDatabase();
  await prisma.user.create({
    data: {
      email: `category-db-${Date.now()}-${Math.random()}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      name: "FK Tester",
      role: ROLES.CUSTOMER,
    },
  });
});

describe("Category referential integrity", () => {
  it("is seeded with every app category and its label", async () => {
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.key)).toEqual([
      "GROCERIES",
      "FOOD",
      "FASHION",
      "ELECTRONICS",
      "GIFTS",
      "BEAUTY",
      "HOME_SERVICES",
      "ERRANDS",
      "REPAIRS",
      "EVENTS",
      "PHOTOGRAPHY",
      "OTHER",
    ]);
    const food = rows.find((r) => r.key === "FOOD");
    expect(food?.label).toBe("Food & Drinks");
  });

  it("rejects a Request with an unknown category", async () => {
    const customer = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });
    await expect(
      prisma.request.create({
        data: {
          reference: "REQ-INVALID-CAT",
          customerId: customer.id,
          category: "NOT_A_CATEGORY",
          summary: "Broken category",
          description: "Should be blocked by the foreign key",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects an Offering with an unknown category", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });
    const supplier = await prisma.supplier.create({
      data: {
        userId: user.id,
        businessName: "FK Supplier",
        contactName: "FK",
        status: "APPROVED",
      },
    });
    await expect(
      prisma.offering.create({
        data: {
          supplierId: supplier.id,
          category: "NOPE",
          title: "Broken offering",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects joining a Supplier to an unknown category", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });
    const supplier = await prisma.supplier.create({
      data: {
        userId: user.id,
        businessName: "FK Supplier",
        contactName: "FK",
        status: "APPROVED",
      },
    });
    await expect(
      prisma.supplierCategory.create({
        data: { supplierId: supplier.id, categoryKey: "HOVERBOARD" },
      }),
    ).rejects.toThrow();
  });

  it("protects a category still referenced by a request from deletion", async () => {
    const customer = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });
    await prisma.request.create({
      data: {
        reference: "REQ-KEEP-CAT",
        customerId: customer.id,
        category: "ELECTRONICS",
        summary: "Keep this category",
        description: "Blocks deletion while in use",
      },
    });
    await expect(
      prisma.category.delete({ where: { key: "ELECTRONICS" } }),
    ).rejects.toThrow();
  });
});