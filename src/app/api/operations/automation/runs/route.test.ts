import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  makeRead,
  createOperatorAndCollectCookies,
  registerAndCollectCookies,
  resetDatabase,
} from "@/lib/test/http";
import { GET as runsRoute } from "@/app/api/operations/automation/runs/route";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeAuthGet(session: NextRequest, path: string): NextRequest {
  const req = makeRead(path);
  copyCookies(session, req);
  return req;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/operations/automation/runs", () => {
  it("is restricted to operators", async () => {
    const customer = await registerAndCollectCookies();
    const res = await runsRoute(makeAuthGet(customer.req, "/api/operations/automation/runs"));
    expect(res.status).toBe(403);
  });

  it("returns the automation ledger with totals", async () => {
    const operator = await createOperatorAndCollectCookies();
    await prisma.automationRun.create({
      data: {
        reference: "AUTO-TEST1",
        trigger: "REQUEST_CREATED",
        requestId: null,
        status: "COMPLETED",
        summary: "test run",
        results: "[]",
      },
    });

    const res = await runsRoute(makeAuthGet(operator.req, "/api/operations/automation/runs"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data?: {
        runs: Array<{ reference: string; trigger: string; status: string }>;
        totals: { completed: number; skipped: number; failed: number };
        triggers: string[];
      };
    };
    expect(json.data?.triggers).toEqual([
      "REQUEST_CREATED",
      "PAYMENT_PAID",
      "DELIVERED",
      "LOW_STOCK",
    ]);
    expect(json.data?.totals.completed).toBe(1);
    expect(json.data?.runs[0].reference).toBe("AUTO-TEST1");
  });
});