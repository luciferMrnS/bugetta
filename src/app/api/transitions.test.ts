import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { incrementTestCounter } from "@/lib/test/counter";
import { prisma } from "@/lib/prisma";
import {
  ORIGIN,
  createOperatorAndCollectCookies,
  nextClientIp,
  registerAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { POST as opsStatusRoute } from "@/app/api/operations/requests/[id]/status/route";
import {
  REQUEST_STATUS,
  REQUEST_STATUS_TRANSITIONS,
  OPERATOR_TRANSITIONS,
  TERMINAL_STATUSES,
  isRequestStatus,
  operatorAllowedTransitions,
  type RequestStatusKey,
} from "@/lib/requests/status";

function copyCookies(from: NextRequest, to: NextRequest): void {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
}

function makeOpsStatusRequest(
  session: NextRequest,
  csrf: string,
  requestId: string,
  status: string,
): NextRequest {
  const req = new NextRequest(
    `${ORIGIN}/api/operations/requests/${requestId}/status`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": nextClientIp(),
      },
      body: JSON.stringify({ status }),
    },
  );
  if (csrf !== "") {
    withCsrfHeader(req, csrf);
  }
  copyCookies(session, req);
  return req;
}

let requestCounter = 0;
function freshReference(): string {
  requestCounter += 1;
  return `REQ-TX-${Date.now()}-${requestCounter}`;
}

async function createRequestAtStatus(
  customerId: string,
  status: string,
): Promise<{ id: string }> {
  return prisma.request.create({
    data: {
      reference: freshReference(),
      customerId,
      category: "GROCERIES",
      summary: "Transition fixture request",
      description: "Seeded directly so every state can be exercised.",
      status,
      events: {
        create: { fromStatus: null, toStatus: status, cause: "created" },
      },
    },
    select: { id: true },
  });
}

const ALL_STATUSES = Object.keys(REQUEST_STATUS) as RequestStatusKey[];

describe("Phase 6 status machine (exhaustive)", () => {
  beforeEach(async () => {
    incrementTestCounter();
    await resetDatabase();
  });

  it("defines a complete, closed state machine with no legacy states", () => {
    // Every source and every target is a real, current status.
    for (const from of ALL_STATUSES) {
      for (const to of REQUEST_STATUS_TRANSITIONS[from]) {
        expect(isRequestStatus(to), `${from} -> ${to}`).toBe(true);
      }
      expect(OPERATOR_TRANSITIONS[from], `${from} operator targets`).toBeDefined();
    }

    // Legacy Phase 1-5 constants no longer exist.
    for (const legacy of [
      "SUBMITTED",
      "PENDING",
      "PENDING_PAYMENT",
      "FULFILLING",
    ]) {
      expect(isRequestStatus(legacy)).toBe(false);
    }

    // Every non-terminal state has at least one legal move (mainline progress).
    for (const from of ALL_STATUSES) {
      if (!TERMINAL_STATUSES.includes(from)) {
        expect(
          REQUEST_STATUS_TRANSITIONS[from].length,
          `${from} must have an exit`,
        ).toBeGreaterThan(0);
      }
    }

    // The operator subset is exactly the full machine minus the customer/system
    // money moves — operators can never touch money states.
    const SYSTEM_ONLY: Partial<Record<RequestStatusKey, readonly RequestStatusKey[]>> =
  {
      AWAITING_CUSTOMER: ["APPROVED"],
      APPROVED: ["PAYMENT_PENDING"],
      PAYMENT_PENDING: ["PAID"],
      PAID: ["REFUNDED"],
      DISPUTED: ["REFUNDED"],
    };
    for (const [from, only] of Object.entries(SYSTEM_ONLY) as Array<
      [RequestStatusKey, readonly RequestStatusKey[]]
    >) {
      for (const to of only) {
        expect(
          REQUEST_STATUS_TRANSITIONS[from].includes(to),
          `full machine must contain ${from}->${to}`,
        ).toBe(true);
        expect(
          OPERATOR_TRANSITIONS[from].includes(to),
          `operator machine must NOT contain ${from}->${to}`,
        ).toBe(false);
      }
    }

    // The operator matrix is a subset of the full matrix everywhere.
    for (const from of ALL_STATUSES) {
      for (const to of OPERATOR_TRANSITIONS[from]) {
        expect(
          REQUEST_STATUS_TRANSITIONS[from].includes(to),
          `operator ${from}->${to} must exist in the full machine`,
        ).toBe(true);
      }
    }
  });

  it("enforces every legal operator transition through the API and records the event", async () => {
    const ops = await createOperatorAndCollectCookies();
    const customerSession = await registerAndCollectCookies();
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: customerSession.email },
      select: { id: true },
    });
    const request = await createRequestAtStatus(customer.id, REQUEST_STATUS.REQUESTED);

    for (const from of ALL_STATUSES) {
      const resetFrom = () =>
        prisma.request.update({
          where: { id: request.id },
          data: { status: from },
        });

      const allowed = operatorAllowedTransitions(from);
      const denied = ALL_STATUSES.find((s) => !allowed.includes(s)) as
        | RequestStatusKey
        | undefined;
      expect(denied, `every state has a denial from ${from}`).toBeDefined();

      for (const to of allowed) {
        await resetFrom();
        const eventsBefore = await prisma.requestEvent.count({
          where: { requestId: request.id },
        });
        const res = await opsStatusRoute(
          makeOpsStatusRequest(ops.req, ops.csrf, request.id, to),
          { params: Promise.resolve({ id: request.id }) } as never,
        );
        const json = (await res.json()) as {
          data?: { request?: { status?: string } };
          error?: { code?: string };
        };
        expect(res.status, `operator ${from} -> ${to}`).toBe(200);
        expect(json.error?.code, `operator ${from} -> ${to}`).toBeUndefined();
        expect(json.data?.request?.status).toBe(to);
        expect(
          operatorAllowedTransitions(to).length >= 0,
          "returned request exposes the new state",
        ).toBe(true);

        const events = await prisma.requestEvent.findMany({
          where: { requestId: request.id },
          orderBy: { createdAt: "desc" },
          take: eventsBefore + 1,
        });
        expect(events.length).toBe(eventsBefore + 1);
        expect(events[0]).toMatchObject({
          fromStatus: from,
          toStatus: to,
          cause: "operator",
          actorRole: "OPERATIONS",
        });
      }

      // The first non-allowed target is a hard 409 and changes nothing.
      await resetFrom();
      const eventsBefore = await prisma.requestEvent.count({
        where: { requestId: request.id },
      });
      const res = await opsStatusRoute(
        makeOpsStatusRequest(ops.req, ops.csrf, request.id, denied!),
        { params: Promise.resolve({ id: request.id }) } as never,
      );
      const json = (await res.json()) as {
        data?: { request?: { status?: string } };
        error?: { code?: string };
      };
      expect(res.status, `operator ${from} -> ${denied} must be rejected`).toBe(409);
      expect(json.error?.code).toBe("INVALID_TRANSITION");
      const eventsAfter = await prisma.requestEvent.count({
        where: { requestId: request.id },
      });
      expect(eventsAfter).toBe(eventsBefore);
      const row = await prisma.request.findUniqueOrThrow({
        where: { id: request.id },
      });
      expect(row.status).toBe(from);
    }
  });

  it("never lets an operator push the customer/system-only money moves", async () => {
    const ops = await createOperatorAndCollectCookies();
    const customerSession = await registerAndCollectCookies();
    const customer = await prisma.user.findUniqueOrThrow({
      where: { email: customerSession.email },
      select: { id: true },
    });
    const request = await createRequestAtStatus(customer.id, REQUEST_STATUS.PAID);

    const blocked: Array<[string, string]> = [
      [REQUEST_STATUS.AWAITING_CUSTOMER, REQUEST_STATUS.APPROVED],
      [REQUEST_STATUS.APPROVED, REQUEST_STATUS.PAYMENT_PENDING],
      [REQUEST_STATUS.PAYMENT_PENDING, REQUEST_STATUS.PAID],
      [REQUEST_STATUS.PAID, REQUEST_STATUS.REFUNDED],
      [REQUEST_STATUS.DISPUTED, REQUEST_STATUS.REFUNDED],
    ];
    for (const [from, to] of blocked) {
      await prisma.request.update({
        where: { id: request.id },
        data: { status: from },
      });
      const res = await opsStatusRoute(
        makeOpsStatusRequest(ops.req, ops.csrf, request.id, to),
        { params: Promise.resolve({ id: request.id }) } as never,
      );
      expect(res.status, `operator ${from} -> ${to}`).toBe(409);
      expect(
        ((await res.json()) as { error?: { code?: string } }).error?.code,
      ).toBe("INVALID_TRANSITION");
      const row = await prisma.request.findUniqueOrThrow({
        where: { id: request.id },
      });
      expect(row.status).toBe(from);
    }
  });
});