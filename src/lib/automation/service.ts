import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notify/service";

export const AUTOMATION_TRIGGERS = [
  "REQUEST_CREATED",
  "PAYMENT_PAID",
  "DELIVERED",
  "LOW_STOCK",
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

export const AUTOMATION_RUN_STATUS = {
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
} as const;

export const LOW_STOCK_THRESHOLD = 5;

const REFERENCE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReference(prefix: string): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_CHARS[Math.floor(Math.random() * REFERENCE_CHARS.length)];
  }
  return `${prefix}-${out}`;
}

export interface AutomationAction {
  action: string;
  detail: string;
  reference?: string;
}

export interface AutomationRunView {
  id: string;
  reference: string;
  trigger: AutomationTrigger;
  requestId: string | null;
  requestReference: string | null;
  status: string;
  summary: string | null;
  results: AutomationAction[];
  error: string | null;
  createdAt: string;
}

type AutomationRunRow = {
  id: string;
  reference: string;
  trigger: string;
  requestId: string | null;
  status: string;
  summary: string | null;
  results: string;
  error: string | null;
  createdAt: Date;
  request?: { reference: string } | null;
};

function parseResults(encoded: string): AutomationAction[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed) ? (parsed as AutomationAction[]) : [];
  } catch {
    return [];
  }
}

export function serializeAutomationRun(row: AutomationRunRow): AutomationRunView {
  return {
    id: row.id,
    reference: row.reference,
    trigger: row.trigger as AutomationTrigger,
    requestId: row.requestId,
    requestReference: row.request?.reference ?? null,
    status: row.status,
    summary: row.summary,
    results: parseResults(row.results),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RunAutomationInput {
  trigger: AutomationTrigger;
  requestId?: string | null;
  supplierId?: string | null;
  offeringId?: string | null;
  now?: Date;
}

export class AutomationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Core automation entry point. Idempotent for REQUEST_CREATED (one run per
// request). Other triggers are naturally idempotent by design (webhook
// deduplication in payments, delivery status guards). Errors are captured
// in the run row so they never break the primary operation.
export async function runAutomation(
  input: RunAutomationInput,
): Promise<AutomationRunView> {
  const now = input.now ?? new Date();
  const trigger = input.trigger;
  const requestId = input.requestId ?? null;

  // Idempotency: skip if a run for this trigger+request already exists.
  if (trigger === "REQUEST_CREATED" && requestId) {
    const existing = await prisma.automationRun.findFirst({
      where: { trigger, requestId },
      select: { id: true },
    });
    if (existing) {
      const skipped = await prisma.automationRun.create({
        data: {
          reference: randomReference("AUTO"),
          trigger,
          requestId,
          status: "SKIPPED",
          summary: "Automation already executed for this request.",
          results: JSON.stringify([]),
          createdAt: now,
        },
      });
      return serializeAutomationRun(skipped);
    }
  }

  // LOW_STOCK idempotency: skip if a low-stock notification was already
  // sent for this offering in the last 24 hours.
  if (trigger === "LOW_STOCK" && input.offeringId) {
    const recent = await prisma.notification.findFirst({
      where: {
        kind: "LOW_STOCK",
        reference: input.offeringId,
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      const skipped = await prisma.automationRun.create({
        data: {
          reference: randomReference("AUTO"),
          trigger,
          requestId: null,
          status: "SKIPPED",
          summary: "Low-stock notification already sent recently.",
          results: JSON.stringify([]),
          createdAt: now,
        },
      });
      return serializeAutomationRun(skipped);
    }
  }

  const runRef = randomReference("AUTO");
  const results: AutomationAction[] = [];

  try {
    switch (trigger) {
      case "REQUEST_CREATED": {
        if (!requestId) throw new AutomationError("MISSING_REQUEST", "REQUEST_CREATED requires requestId");
        return handleRequestCreated(requestId, runRef, now);
      }
      case "PAYMENT_PAID": {
        if (!requestId) throw new AutomationError("MISSING_REQUEST", "PAYMENT_PAID requires requestId");
        return handlePaymentPaid(requestId, runRef, now);
      }
      case "DELIVERED": {
        if (!requestId) throw new AutomationError("MISSING_REQUEST", "DELIVERED requires requestId");
        return handleDelivered(requestId, runRef, now);
      }
      case "LOW_STOCK": {
        if (!input.supplierId || !input.offeringId) {
          throw new AutomationError("MISSING_PARAMS", "LOW_STOCK requires supplierId and offeringId");
        }
        return handleLowStock(input.supplierId, input.offeringId, runRef, now);
      }
      default:
        throw new AutomationError("UNKNOWN_TRIGGER", `Unknown automation trigger: ${trigger}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const failed = await prisma.automationRun.create({
      data: {
        reference: runRef,
        trigger,
        requestId,
        status: "FAILED",
        summary: `Automation failed: ${errorMessage}`,
        results: JSON.stringify(results),
        error: errorMessage,
        createdAt: now,
      },
    });
    return serializeAutomationRun(failed);
  }
}

// ─── Trigger handlers ────────────────────────────────────────────────────────

async function handleRequestCreated(requestId: string, runRef: string, now: Date) {
  const results: AutomationAction[] = [];

  // Customer ack
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, reference: true, summary: true, customerId: true },
  });
  if (!request) throw new AutomationError("NOT_FOUND", "Request not found");

  await sendNotification({
    userId: request.customerId,
    kind: "REQUEST_CREATED",
    reference: request.reference,
    vars: { ref: request.reference, summary: request.summary },
    now,
  });
  results.push({ action: "notify.customer", detail: `REQUEST_CREATED sent for ${request.reference}` });

  const completed = await prisma.automationRun.create({
    data: {
      reference: runRef,
      trigger: "REQUEST_CREATED",
      requestId,
      status: "COMPLETED",
      summary: "Request acknowledged. Options are sourced and typed by the team.",
      results: JSON.stringify(results),
      createdAt: now,
    },
  });
  return serializeAutomationRun(completed);
}

async function handlePaymentPaid(requestId: string, runRef: string, now: Date) {
  const results: AutomationAction[] = [];

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, reference: true, summary: true, customerId: true },
  });
  if (!request) throw new AutomationError("NOT_FOUND", "Request not found");

  // 1) Notify customer payment received
  await sendNotification({
    userId: request.customerId,
    kind: "PAYMENT_PAID",
    reference: request.reference,
    vars: { ref: request.reference, summary: request.summary, amountLabel: "your payment" },
    now,
  });
  results.push({ action: "notify.customer", detail: "PAYMENT_PAID sent" });

  // 2) Notify assigned supplier (if any) that order is paid and ready for processing
  const assignment = await prisma.supplierRequest.findFirst({
    where: { requestId, status: { in: ["ASSIGNED", "ACCEPTED"] } },
    select: { supplierId: true, supplier: { select: { userId: true } } },
  });
  if (assignment?.supplier?.userId) {
    await sendNotification({
      userId: assignment.supplier.userId,
      kind: "ORDER_PROCESSING",
      reference: request.reference,
      vars: { ref: request.reference, summary: request.summary, amountLabel: "the order amount" },
      now,
    });
    results.push({ action: "notify.supplier", detail: `ORDER_PROCESSING sent to supplier ${assignment.supplierId}` });
  }

  const completed = await prisma.automationRun.create({
    data: {
      reference: runRef,
      trigger: "PAYMENT_PAID",
      requestId,
      status: "COMPLETED",
      summary: "Payment captured notifications sent",
      results: JSON.stringify(results),
      createdAt: now,
    },
  });
  return serializeAutomationRun(completed);
}

async function handleDelivered(requestId: string, runRef: string, now: Date) {
  const results: AutomationAction[] = [];

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, reference: true, summary: true, customerId: true },
  });
  if (!request) throw new AutomationError("NOT_FOUND", "Request not found");

  // 1) Notify customer delivered
  await sendNotification({
    userId: request.customerId,
    kind: "DELIVERED",
    reference: request.reference,
    vars: { ref: request.reference, summary: request.summary },
    now,
  });
  results.push({ action: "notify.customer", detail: "DELIVERED sent" });

  // 2) Notify assigned supplier delivery confirmed
  const assignment = await prisma.supplierRequest.findFirst({
    where: { requestId, status: { in: ["ACCEPTED", "FULFILLED"] } },
    select: { supplierId: true, supplier: { select: { userId: true } } },
  });
  if (assignment?.supplier?.userId) {
    await sendNotification({
      userId: assignment.supplier.userId,
      kind: "DELIVERED",
      reference: request.reference,
      vars: { ref: request.reference, summary: request.summary },
      now,
    });
    results.push({ action: "notify.supplier", detail: `DELIVERED sent to supplier ${assignment.supplierId}` });
  }

  const completed = await prisma.automationRun.create({
    data: {
      reference: runRef,
      trigger: "DELIVERED",
      requestId,
      status: "COMPLETED",
      summary: "Delivery notifications sent",
      results: JSON.stringify(results),
      createdAt: now,
    },
  });
  return serializeAutomationRun(completed);
}

async function handleLowStock(supplierId: string, offeringId: string, runRef: string, now: Date) {
  const results: AutomationAction[] = [];

  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    select: { id: true, title: true, quantityAvailable: true, supplier: { select: { userId: true, businessName: true } } },
  });
  if (!offering) throw new AutomationError("NOT_FOUND", "Offering not found");

  // Notify supplier
  await sendNotification({
    userId: offering.supplier.userId,
    kind: "LOW_STOCK",
    reference: offeringId,
    vars: { productName: offering.title, quantity: String(offering.quantityAvailable ?? 0) },
    now,
  });
  results.push({ action: "notify.supplier", detail: `LOW_STOCK sent for ${offering.title} (qty: ${offering.quantityAvailable})` });

  const completed = await prisma.automationRun.create({
    data: {
      reference: runRef,
      trigger: "LOW_STOCK",
      requestId: null,
      status: "COMPLETED",
      summary: `Low-stock alert for ${offering.title} (quantity: ${offering.quantityAvailable})`,
      results: JSON.stringify(results),
      createdAt: now,
    },
  });
  return serializeAutomationRun(completed);
}

