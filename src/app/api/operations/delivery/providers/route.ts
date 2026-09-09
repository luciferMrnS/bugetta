import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { listDeliveryProviders } from "@/lib/delivery/providers/registry";

export const dynamic = "force-dynamic";

// GET /api/operations/delivery/providers — the registry of logistics providers
// an operator may assign to. Read-only; fee computation happens per assignment.
export async function GET(request: NextRequest) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }
  return ok({ providers: listDeliveryProviders() });
}