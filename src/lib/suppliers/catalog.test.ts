import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { resetDatabase, PASSWORD } from "@/lib/test/http";
import {
  runCatalogSync,
  listCatalogSyncs,
} from "@/lib/suppliers/catalog";
import { SupplierError } from "@/lib/suppliers/service";
import { LOW_STOCK_THRESHOLD } from "@/lib/automation/service";

async function makeSupplier(): Promise<{ supplierId: string; userId: string }> {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: `catalog-${Date.now()}-${Math.random()}@example.com`,
      passwordHash,
      name: "Catalog Tim",
      role: ROLES.SUPPLIER,
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      userId: user.id,
      businessName: "Tim's Catalogue",
      contactName: "Tim",
      supplierCategories: { create: [{ categoryKey: "GROCERIES" }] },
      status: "APPROVED",
    },
  });
  return { supplierId: supplier.id, userId: user.id };
}

async function makeOffering(supplierId: string, title: string): Promise<string> {
  const offering = await prisma.offering.create({
    data: {
      supplierId,
      category: "GROCERIES",
      title,
      priceKobo: 500000,
      currency: "NGN",
      images: "[]",
      isActive: true,
      quantityAvailable: null,
      lastSyncedAt: null,
    },
  });
  return offering.id;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("runCatalogSync", () => {
  it("applies stock counts and stamps lastSyncedAt on sync", async () => {
    const { supplierId } = await makeSupplier();
    const offeringId = await makeOffering(supplierId, "Ewedu leaves");

    const run = await runCatalogSync(supplierId, {
      provider: "api",
      entries: [{ offeringId, quantityAvailable: 40 }],
    });

    expect(run.status).toBe("COMPLETED");
    expect(run.reference).toMatch(/^SYN-/);
    expect(run.provider).toBe("api");
    expect(run.entries[0].action).toBe("updated");
    expect(run.entries[0].quantityAvailable).toBe(40);
    expect(run).toHaveProperty("summary", "1 updated, 0 deactivated, 0 low-stock alerts");

    const stored = await prisma.offering.findUnique({ where: { id: offeringId } });
    expect(stored?.quantityAvailable).toBe(40);
    expect(stored?.lastSyncedAt).not.toBeNull();
    expect(stored?.isActive).toBe(true);
  });

  it("deactivates offerings that hit zero stock", async () => {
    const { supplierId } = await makeSupplier();
    const offeringId = await makeOffering(supplierId, "Gari");

    const run = await runCatalogSync(supplierId, {
      entries: [{ offeringId, quantityAvailable: 0 }],
    });

    expect(run.entries[0].action).toBe("deactivated");
    expect(run.entries[0].wasDeactivated).toBe(true);
    expect(await prisma.offering.findUnique({ where: { id: offeringId } })).toMatchObject({
      quantityAvailable: 0,
      isActive: false,
    });
  });

  it("raises a low-stock alert once per 24h window", async () => {
    const { supplierId, userId } = await makeSupplier();
    const offeringId = await makeOffering(supplierId, "Milk");

    const first = await runCatalogSync(supplierId, {
      entries: [{ offeringId, quantityAvailable: 2 }],
    });
    expect(first.entries[0].action).toBe("low_stock");
    expect(first.entries[0].lowStockAlerted).toBe(true);

    const lowStockNotifications = await prisma.notification.findMany({
      where: { userId, kind: "LOW_STOCK", reference: offeringId },
    });
    expect(lowStockNotifications).toHaveLength(1);

    // A second sync within 24h must not re-alert.
    const second = await runCatalogSync(supplierId, {
      entries: [{ offeringId, quantityAvailable: 1 }],
    });
    expect(second.entries[0].lowStockAlerted).toBe(false);
    expect(
      await prisma.notification.count({
        where: { userId, kind: "LOW_STOCK", reference: offeringId },
      }),
    ).toBe(1);
  });

  it("does not alert when stock stays comfortably above threshold", async () => {
    const { supplierId } = await makeSupplier();
    const offeringId = await makeOffering(supplierId, "Bags of rice");

    const run = await runCatalogSync(supplierId, {
      entries: [{ offeringId, quantityAvailable: LOW_STOCK_THRESHOLD + 10 }],
    });
    expect(run.entries[0].action).toBe("updated");
    expect(run.entries[0].lowStockAlerted).toBe(false);
  });

  it("rejects foreign offerings and marks the run PARTIAL", async () => {
    const { supplierId } = await makeSupplier();
    const { supplierId: otherSupplier } = await makeSupplier();
    const foreignOffering = await makeOffering(otherSupplier, "Not yours");

    const run = await runCatalogSync(supplierId, {
      entries: [{ offeringId: foreignOffering, quantityAvailable: 5 }],
    });

    expect(run.status).toBe("FAILED");
    expect(run.entries[0].action).toBe("not_found");
    expect(run.error).toContain("entry not found");
  });

  it("rejects an empty batch", async () => {
    const { supplierId } = await makeSupplier();
    await expect(
      runCatalogSync(supplierId, { entries: [] }),
    ).rejects.toBeInstanceOf(SupplierError);
  });
});

describe("listCatalogSyncs", () => {
  it("returns the supplier's runs newest first", async () => {
    const { supplierId } = await makeSupplier();
    const offeringId = await makeOffering(supplierId, "Onions");
    await runCatalogSync(supplierId, { entries: [{ offeringId, quantityAvailable: 10 }] });
    await runCatalogSync(supplierId, { entries: [{ offeringId, quantityAvailable: 8 }] });

    const runs = await listCatalogSyncs(supplierId);
    expect(runs).toHaveLength(2);
    expect(runs[0].createdAt >= runs[1].createdAt).toBe(true);
  });
});