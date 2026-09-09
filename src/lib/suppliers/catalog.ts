import { prisma } from "@/lib/prisma";
import { SupplierError } from "@/lib/suppliers/service";
import { runAutomation, LOW_STOCK_THRESHOLD } from "@/lib/automation/service";

// Inventory synchronisation. A supplier ERP (or the web form) pushes stock
// counts for their catalogue; every run is audited as a CatalogSync row so the
// history of "who told us how much stock remained" is always traceable. This
// is the "supplier API" surface: the batch endpoint is deliberately stateless
// and ownership-scoped, mirroring what a real vendor API would accept.

export interface CatalogSyncEntryInput {
  offeringId: string;
  quantityAvailable: number | null;
}

export interface CatalogSyncEntryResult {
  offeringId: string;
  title: string;
  action: "updated" | "deactivated" | "low_stock" | "not_found" | "skipped";
  quantityAvailable: number | null;
  wasDeactivated: boolean;
  lowStockAlerted: boolean;
}

export interface CatalogSyncView {
  id: string;
  reference: string;
  provider: string;
  status: string; // COMPLETED | PARTIAL | FAILED
  summary: string | null;
  entries: CatalogSyncEntryResult[];
  error: string | null;
  createdAt: string;
}

type CatalogSyncRow = {
  id: string;
  reference: string;
  provider: string;
  status: string;
  summary: string | null;
  entries: string;
  error: string | null;
  createdAt: Date;
};

export function serializeCatalogSync(row: CatalogSyncRow): CatalogSyncView {
  let entries: CatalogSyncEntryResult[] = [];
  try {
    const parsed: unknown = JSON.parse(row.entries);
    if (Array.isArray(parsed)) {
      entries = parsed as CatalogSyncEntryResult[];
    }
  } catch {
    entries = [];
  }
  return {
    id: row.id,
    reference: row.reference,
    provider: row.provider,
    status: row.status,
    summary: row.summary,
    entries,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReference(prefix: string): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `${prefix}-${out}`;
}

async function withUniqueReference<T extends { reference: string }>(
  build: (reference: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await build(randomReference("SYN"));
    } catch (error) {
      const uniqueViolation =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";
      if (!uniqueViolation || attempt === 2) {
        throw error;
      }
    }
  }
  throw new SupplierError("INTERNAL", "Could not allocate a catalogue sync reference.");
}

export async function listCatalogSyncs(supplierId: string): Promise<CatalogSyncView[]> {
  const rows = await prisma.catalogSync.findMany({
    where: { supplierId },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  });
  return rows.map(serializeCatalogSync);
}

export async function runCatalogSync(
  supplierId: string,
  input: { provider?: string; entries: CatalogSyncEntryInput[] },
): Promise<CatalogSyncView> {
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new SupplierError("EMPTY_SYNC", "No catalogue entries supplied.");
  }

  const provider = input.provider === "web" ? "web" : "api";
  const now = new Date();

  // Load the supplier's own offerings once, keyed by id (ownership gate).
  const owned = await prisma.offering.findMany({
    where: { supplierId },
    select: { id: true, title: true, quantityAvailable: true, isActive: true },
  });
  const ownedById = new Map(owned.map((o) => [o.id, o]));

  const entryResults: CatalogSyncEntryResult[] = [];
  let updated = 0;
  let deactivated = 0;
  let lowStockAlerted = 0;
  let notFound = 0;

  for (const entry of input.entries) {
    const offering = ownedById.get(entry.offeringId);
    if (!offering) {
      notFound += 1;
      entryResults.push({
        offeringId: entry.offeringId,
        title: "(not found)",
        action: "not_found",
        quantityAvailable: null,
        wasDeactivated: false,
        lowStockAlerted: false,
      });
      continue;
    }

    const quantity =
      typeof entry.quantityAvailable === "number" &&
      Number.isFinite(entry.quantityAvailable) &&
      entry.quantityAvailable >= 0
        ? Math.floor(entry.quantityAvailable)
        : null;

    const becameZero = quantity === 0;
    const crossedLow =
      quantity !== null &&
      quantity > 0 &&
      quantity <= LOW_STOCK_THRESHOLD &&
      (offering.quantityAvailable === null ||
        offering.quantityAvailable > LOW_STOCK_THRESHOLD);

    const nextActive = becameZero ? false : offering.isActive;

    await prisma.offering.update({
      where: { id: offering.id },
      data: {
        quantityAvailable: quantity,
        lastSyncedAt: now,
        isActive: nextActive,
      },
    });

    const action = becameZero
      ? "deactivated"
      : crossedLow
        ? "low_stock"
        : "updated";
    if (becameZero) deactivated += 1;
    if (crossedLow) lowStockAlerted += 1;
    if (action === "updated") updated += 1;

    if (crossedLow) {
      // Fire the LOW_STOCK automation (idempotent: one alert per offering per
      // 24h; errors are recorded as a FAILED run, never thrown).
      await runAutomation({
        trigger: "LOW_STOCK",
        supplierId,
        offeringId: offering.id,
        now,
      });
    }

    entryResults.push({
      offeringId: offering.id,
      title: offering.title,
      action,
      quantityAvailable: quantity,
      wasDeactivated: becameZero,
      lowStockAlerted: crossedLow,
    });
  }

  const validEntries = input.entries.length - notFound;
  let status = "FAILED";
  if (validEntries > 0) {
    status = notFound > 0 ? "PARTIAL" : "COMPLETED";
  }
  const summary = `${updated} updated, ${deactivated} deactivated, ${lowStockAlerted} low-stock alerts`;

  return withUniqueReference(async (reference) => {
    const row = await prisma.catalogSync.create({
      data: {
        reference,
        supplierId,
        provider,
        status,
        summary,
        entries: JSON.stringify(entryResults),
        error: notFound > 0 ? `${notFound} entry not found` : null,
        createdAt: now,
      },
    });
    return serializeCatalogSync(row);
  });
}