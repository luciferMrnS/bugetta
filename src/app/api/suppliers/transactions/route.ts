import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardSupplier } from "@/lib/suppliers/access";
import { supplierTransactionHistory } from "@/lib/trust/history";
import { serializeLedgerEntry } from "@/lib/trust/serialize";

export const dynamic = "force-dynamic";

// GET /api/suppliers/transactions — the approved supplier's earnings ledger.
export async function GET(request: NextRequest) {
  const guard = await guardSupplier(request);
  if (!guard.ok) {
    return guard.response;
  }
  const history = await supplierTransactionHistory(guard.supplierId);
  return ok({ transactions: history.map(serializeLedgerEntry) });
}