import { prisma } from "@/lib/prisma";
import { matchSuppliersToRequest } from "@/lib/suppliers/matching";
import { createRequestOption, createRequestQuote } from "@/lib/operations/service";
import { sendNotification } from "@/lib/notify/service";
import { getDeliveryProvider } from "@/lib/delivery/providers/registry";
import { minorUnitsFromMajor, majorUnitsFromMinor } from "@/lib/money";

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

export const MAX_AUTO_QUOTES = 3;
export const AUTO_QUOTE_SERVICE_FEE_NAIRA = 1500;
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

  // 1) Customer ack
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, reference: true, summary: true, category: true, location: true, customerId: true, budgetKobo: true, deliveryDeadline: true },
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

  // 2) Supplier discovery via matching engine
  const match = await matchSuppliersToRequest(requestId);
  if (match.matches.length === 0) {
    results.push({ action: "match", detail: "No supplier matches found" });
  } else {
    // Resolve userIds for matched suppliers
    const supplierIds = match.matches.slice(0, 5).map((m) => m.supplierId);
    const supplierUsers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, userId: true },
    });
    const supplierIdToUserId = new Map(supplierUsers.map((s) => [s.id, s.userId]));

    const topMatches = match.matches.slice(0, 5);
    for (const supplier of topMatches) {
      const userId = supplierIdToUserId.get(supplier.supplierId);
      if (!userId) continue;
      await sendNotification({
        userId,
        kind: "SUPPLIER_LEAD",
        reference: request.reference,
        vars: {
          ref: request.reference,
          summary: request.summary,
          categoryLabel: match.request.categoryLabel,
        },
        now,
      });
      results.push({ action: "notify.supplier", detail: `SUPPLIER_LEAD sent to ${supplier.businessName}`, reference: supplier.supplierId });
    }
  }

  // 3) Auto-quote generation for up to MAX_AUTO_QUOTES priced offerings
  const pricedMatches = match.matches.filter((m) =>
    m.offeringMatches.some((o) => o.priceNaira !== null),
  );
  for (const supplier of pricedMatches.slice(0, MAX_AUTO_QUOTES)) {
    const cheapestOffering = supplier.offeringMatches
      .filter((o) => o.priceNaira !== null)
      .sort((a, b) => (a.priceNaira ?? 0) - (b.priceNaira ?? 0))[0];
    if (!cheapestOffering) continue;

    const priceKobo = minorUnitsFromMajor(cheapestOffering.priceNaira ?? 0);
    const deliveryKobo = await estimateDeliveryFee(request.location ?? null);
    const estimatedDelivery = await estimateDeliveryWindow(request.location ?? null, now);

    // Create RequestOption (internal research line, mirrors ops flow)
    const option = await createRequestOption(requestId, {
      supplier: supplier.businessName,
      productName: cheapestOffering.title,
      priceNaira: majorUnitsFromMinor(priceKobo),
      availability: "Auto-sourced from catalogue",
      estimatedDelivery,
      notes: "Auto-generated from matched supplier catalogue",
      images: [],
    });

    // Create the customer-facing PENDING quote, marked AUTO so ops can tell
    // machine-made offers from hand-crafted ones at a glance.
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await createRequestQuote(requestId, {
      optionId: option.id,
      productName: cheapestOffering.title,
      priceNaira: majorUnitsFromMinor(priceKobo),
      serviceFeeNaira: AUTO_QUOTE_SERVICE_FEE_NAIRA,
      deliveryFeeNaira: majorUnitsFromMinor(deliveryKobo),
      information: "Auto-generated from matched supplier catalogue",
      images: [],
      estimatedDelivery,
      validUntil: validUntil.toISOString().slice(0, 10),
      source: "AUTO",
    });

    results.push({ action: "auto_quote", detail: `Auto-quote created for ${supplier.businessName}: ${cheapestOffering.title}`, reference: option.id });
  }

  // 4) Notify customer that auto-quotes are ready (if any)
  if (results.some((r) => r.action === "auto_quote")) {
    await sendNotification({
      userId: request.customerId,
      kind: "QUOTE_READY",
      reference: request.reference,
      vars: { ref: request.reference, productName: "New options", priceLabel: "from your matched suppliers" },
      now,
    });
    results.push({ action: "notify.customer", detail: "QUOTE_READY sent for auto-quotes" });
  }

  const summary = `Discovered ${match.matches.length} suppliers, created ${results.filter(r=>r.action==="auto_quote").length} auto-quotes`;
  const completed = await prisma.automationRun.create({
    data: {
      reference: runRef,
      trigger: "REQUEST_CREATED",
      requestId,
      status: "COMPLETED",
      summary,
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

// Fee + ETA from the sandbox logistics provider. Delivery is quoted against
// the requested drop-off location because pickup is decided later in fulfilment.
async function estimateDeliveryFee(dropLocation: string | null): Promise<number> {
  const provider = getDeliveryProvider("sandbox");
  const quote = provider.quote({
    dropLocation,
    priority: "STANDARD",
    now: new Date(),
  });
  return quote.feeKobo;
}

async function estimateDeliveryWindow(
  dropLocation: string | null,
  now: Date,
): Promise<string> {
  const provider = getDeliveryProvider("sandbox");
  const quote = provider.quote({ dropLocation, priority: "STANDARD", now });
  if (!quote.eta) {
    return "3–5 business days";
  }
  const days = Math.max(
    1,
    Math.round((quote.eta.getTime() - now.getTime()) / 86_400_000),
  );
  return `${days} business day${days === 1 ? "" : "s"}`;
}