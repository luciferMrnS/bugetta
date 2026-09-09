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

  const sinceRaw = request.nextUrl.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;
  const requests = await listRequestsForOperations(
    since && !Number.isNaN(since.getTime()) ? since : undefined,
  );
  return ok({ requests });
}