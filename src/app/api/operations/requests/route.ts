import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { listRequestsForOperations } from "@/lib/operations/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }

  const requests = await listRequestsForOperations();
  return ok({ requests });
}