import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { PAYMENT_STATUS } from "@/lib/payments/status";
import { processPaymentEvent } from "@/lib/payments/service";
import { signWebhook } from "@/lib/payments/provider";
import { transitionDeliveryStatus } from "@/lib/delivery/service";
import { createRequest } from "@/lib/requests/service";
import {
  ORIGIN,
  nextClientIp,
  registerAndCollectCookies,
  createOperatorAndCollectCookies,
  resetDatabase,
  withCsrfHeader,
} from "@/lib/test/http";
import { POST as createRequestRoute } from "@/app/api/requests/route";

async function waitForRun(trigger: string): Promise<{
  status: string;
  summary: string | null;
  requestId: string | null;
}> {
  let run: { status: string; summary: string | null; requestId: string | null } | null = null;
  await vi.waitFor(async () => {
    run = await prisma.automationRun.findFirst({
      where: { trigger },
      select: { status: true, summary: true, requestId: true },
    });
    expect(run).not.toBeNull();
  }, { timeout: 4000, interval: 40 });
  return run!;
}

describe("automation lifecycle hooks", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("fires REQUEST_CREATED when a customer creates a request, notifying them", async () => {
    const { req, csrf } = await registerAndCollectCookies();
    const apiReq = new NextRequest(`${ORIGIN}/api/requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": nextClientIp(),
      },
      body: JSON.stringify({ description: "I need catering for 40 pax tomorrow" }),
    });
    withCsrfHeader(apiReq, csrf);
    for (const cookie of req.cookies.getAll()) {
      apiReq.cookies.set(cookie);
    }

    const res = await createRequestRoute(apiReq);
    expect(res.status).toBe(201);

    const customer = await prisma.user.findFirst({ where: { role: ROLES.CUSTOMER } });
    const run = await waitForRun("REQUEST_CREATED");
    expect(run.status).toBe("COMPLETED");
    expect(run.summary).toContain("Discovered");

    const notice = await prisma.notification.findFirst({
      where: { userId: customer?.id, kind: "REQUEST_CREATED" },
    });
    expect(notice?.reference).toMatch(/^REQ-/);
    expect(notice?.status).toBe("SENT");
  });

  it("fires PAYMENT_PAID when a captured payment event arrives", async () => {
    const customer = await registerAndCollectCookies();
    void customer;
    const customerUser = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });

    const request = await prisma.request.create({
      data: {
        reference: "REQ-LIFE-PAY",
        customer: { connect: { id: customerUser.id } },
        categoryRef: { connect: { key: "ELECTRONICS" } },
        summary: "Office generator",
        description: "Office generator 7.5kva",
        status: REQUEST_STATUS.PAYMENT_PENDING,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        requestId: request.id,
        customerId: customerUser.id,
        amountKobo: 85000000,
        currency: "NGN",
        reference: "PAY-LIFE",
        providerReference: "SBOX-LIFE-1",
        providerStatus: "pending",
        status: PAYMENT_STATUS.PENDING,
        webhookSecret: "lifecycle-secret",
      },
    });

    const body = {
      type: "payment.paid",
      paymentReference: payment.reference,
      providerReference: "SBOX-LIFE-1",
      amountKobo: payment.amountKobo,
      currency: "NGN",
      occurredAt: new Date().toISOString(),
    };
    await processPaymentEvent({
      rawBody: JSON.stringify(body),
      signature: signWebhook("lifecycle-secret", JSON.stringify(body)),
    });

    await vi.waitFor(async () => {
      const current = await prisma.automationRun.findFirst({
        where: { trigger: "PAYMENT_PAID", requestId: request.id },
      });
      expect(current).not.toBeNull();
    }, { timeout: 4000, interval: 40 });
    const run = await prisma.automationRun.findFirst({
      where: { trigger: "PAYMENT_PAID", requestId: request.id },
    });
    expect(run?.status).toBe("COMPLETED");
    expect(run?.summary).toContain("Payment captured");

    const notice = await prisma.notification.findFirst({
      where: { userId: customerUser.id, kind: "PAYMENT_PAID" },
    });
    expect(notice?.kind).toBe("PAYMENT_PAID");
  });

  it("fires DELIVERED and notifies the customer", async () => {
    await registerAndCollectCookies();
    await createOperatorAndCollectCookies();
    const customerUser = await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } });

    const request = await prisma.request.create({
      data: {
        reference: "REQ-LIFE-DLV",
        customer: { connect: { id: customerUser.id } },
        categoryRef: { connect: { key: "ELECTRONICS" } },
        summary: "Projector delivery",
        description: "Projector delivered to office",
        status: REQUEST_STATUS.PAID,
      },
    });
    const delivery = await prisma.delivery.create({
      data: {
        reference: "DLV-LIFE",
        requestId: request.id,
        status: "OUT_FOR_DELIVERY",
        pickup: "Warehouse",
        dropLocation: "Office",
        recipientName: "Ada",
        feeBreakdown: "{}",
      },
    });

    await transitionDeliveryStatus({
      deliveryId: delivery.id,
      operatorUserId: (await prisma.user.findFirstOrThrow({ where: { role: ROLES.OPERATIONS } })).id,
      operatorRole: ROLES.OPERATIONS,
      nextStatus: "DELIVERED",
      recipientName: "Ada",
    });

    await vi.waitFor(async () => {
      const current = await prisma.automationRun.findFirst({
        where: { trigger: "DELIVERED", requestId: request.id },
      });
      expect(current).not.toBeNull();
    }, { timeout: 4000, interval: 40 });
    const run = await prisma.automationRun.findFirst({
      where: { trigger: "DELIVERED", requestId: request.id },
    });
    expect(run?.status).toBe("COMPLETED");

    const notice = await prisma.notification.findFirst({
      where: { userId: customerUser.id, kind: "DELIVERED" },
    });
    expect(notice?.status).toBe("SENT");
  });

  it("records a COMPLETED run even when nobody can supply", async () => {
    const owner = await registerAndCollectCookies();
    const requestOutput = await createRequest({
      description: "Exotic truffle sourcing in Enugu",
      userId: (await prisma.user.findFirstOrThrow({ where: { role: ROLES.CUSTOMER } })).id,
    });
    const requestId = requestOutput.id;
    expect(requestId).toBeDefined();
    void owner;
    await vi.waitFor(async () => {
      const current = await prisma.automationRun.findFirst({
        where: { trigger: "REQUEST_CREATED", requestId },
      });
      expect(current).not.toBeNull();
    }, { timeout: 4000, interval: 40 });
    const run = await prisma.automationRun.findFirst({
      where: { trigger: "REQUEST_CREATED", requestId },
    });
    expect(run?.status).toBe("COMPLETED");
    expect(run?.summary).toContain("Discovered 0 suppliers");
    expect(run?.results).toContain("match");
  });
});