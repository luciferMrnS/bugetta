import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { guardOperations } from "@/lib/operations/access";
import { prisma } from "@/lib/prisma";
import { serializeAutomationRun } from "@/lib/automation/service";

export const dynamic = "force-dynamic";

// GET /api/operations/automation/runs — the automation ledger: every
// REQUEST_CREATED, PAYMENT_PAID, DELIVERED and LOW_STOCK run with its status,
// results and any recorded failure. Read-only audit surface for operations.
export async function GET(request: NextRequest) {
  const guard = await guardOperations(request);
  if (!guard.ok) {
    return guard.response;
  }

  const rows = await prisma.automationRun.findMany({
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: { request: { select: { reference: true } } },
  });
  const runs = rows.map(serializeAutomationRun);
  return ok({
    runs,
    triggers: ["REQUEST_CREATED", "PAYMENT_PAID", "DELIVERED", "LOW_STOCK"],
    totals: {
      completed: rows.filter((r) => r.status === "COMPLETED").length,
      skipped: rows.filter((r) => r.status === "SKIPPED").length,
      failed: rows.filter((r) => r.status === "FAILED").length,
    },
  });
}