// Phase 12 — Analytics & business intelligence.
//
// Every number on the dashboard is DERIVED: it is recomputed on demand from the
// stored ledger (requests, captured payments, refunds, supplier earnings,
// ratings, supplier requests) and never mutated or cached. Windows are defined
// by request.createdAt for demand metrics, payment.paidAt for revenue, and
// refund.createdAt for refunds; all amounts stay in minor units (kobo) until
// serialized to naira.
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/auth/roles";
import { REQUEST_STATUS, requestStatusLabel } from "@/lib/requests/status";
import { CATEGORY_LABELS } from "@/lib/requests/categories";
import { majorUnitsFromMinor } from "@/lib/money";
import { supplierReliability } from "@/lib/trust/scores";

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 365;

// ─── Small pure helpers (unit-tested) ───────────────────────────────────────

// UTC calendar-day key, "YYYY-MM-DD". Used for bucketing and windows so the
// dashboard is deterministic regardless of the server's timezone.
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(`${dayKey(date)}T00:00:00.000Z`);
}

export function endOfUtcDay(date: Date): Date {
  return new Date(`${dayKey(date)}T23:59:59.999Z`);
}

// A percentage from a part/whole, rounded to one decimal. 0/0 → 0 (never NaN).
export function percentRate(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return Math.round((part / whole) * 1000) / 10;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ─── Output shape ────────────────────────────────────────────────────────────

export interface CategoryDemandRow {
  category: string;
  label: string;
  requests: number;
  paid: number;
  cancelled: number;
  open: number;
  conversionRate: number;
  revenueNaira: number;
}

export interface SupplierPerformanceRow {
  supplierId: string;
  businessName: string;
  completed: number;
  earnedNaira: number;
  avgRating: number | null;
  reliabilityScore: number;
  reliabilityBand: string;
}

export interface UnmetCategoryRow {
  category: string;
  label: string;
  cancelled: number;
  open: number;
  total: number;
  budgetNaira: number;
  activeSuppliers: number;
}

export interface UnmetExample {
  requestReference: string;
  summary: string;
  category: string;
  categoryLabel: string;
  status: string;
  statusLabel: string;
  location: string | null;
  budgetNaira: number | null;
}

export interface DailySeriesPoint {
  date: string;
  requests: number;
  paid: number;
  newCustomers: number;
}

export interface AnalyticsDashboard {
  window: {
    days: number;
    from: string;
    to: string;
  };
  summary: {
    requests: { total: number; perDay: number };
    paidRequests: number;
    conversionRate: number;
    averageOrderValueNaira: number;
    revenue: {
      grossNaira: number;
      refundsNaira: number;
      netNaira: number;
      supplierPayoutNaira: number;
      grossMarginNaira: number;
      grossMarginRate: number;
    };
    cancellationRate: number;
    averageFulfillmentHours: number;
    fulfillmentCount: number;
  };
  requestsPerDay: DailySeriesPoint[];
  categoryDemand: CategoryDemandRow[];
  supplierPerformance: SupplierPerformanceRow[];
  customers: {
    payingCustomers: number;
    oneTimeCustomers: number;
    repeatCustomers: number;
    repeatPurchaseRate: number;
    newUsers: number;
    newBuyers: number;
    buyerConversionRate: number;
  };
  unmetDemand: {
    totalRequests: number;
    budgetNaira: number;
    byCategory: UnmetCategoryRow[];
    topItems: Array<{ item: string; count: number }>;
    examples: UnmetExample[];
  };
}

// ─── The dashboard ───────────────────────────────────────────────────────────

export async function getAnalyticsDashboard(
  days: number = DEFAULT_DAYS,
): Promise<AnalyticsDashboard> {
  const clamped = Math.max(1, Math.min(days, MAX_DAYS));
  const to = endOfUtcDay(new Date());
  const from = startOfUtcDay(new Date(Date.now() - (clamped - 1) * 86_400_000));

  // All captured money ever (windowed later) — lets us compute "first-ever
  // purchase" (customer acquisition) alongside in-window revenue.
  const capturedPayments = await prisma.payment.findMany({
    where: {
      status: { in: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] },
      providerStatus: "paid",
    },
    select: {
      id: true,
      requestId: true,
      customerId: true,
      amountKobo: true,
      paidAt: true,
      createdAt: true,
      request: { select: { category: true } },
    },
  });
  const paymentsInWindow = capturedPayments.filter(
    (payment) =>
      payment.paidAt && payment.paidAt >= from && payment.paidAt <= to,
  );

  // Requests created in the window (demand pipeline, statuses, budgets, items).
  const requests = await prisma.request.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: {
      id: true,
      reference: true,
      category: true,
      summary: true,
      status: true,
      location: true,
      budgetKobo: true,
      createdAt: true,
      items: { select: { name: true } },
    },
  });

  // Fulfilment rows (windowed by fulfilledAt) for fulfilment time + suppliers.
  const fulfilledRows = await prisma.supplierRequest.findMany({
    where: { fulfilledAt: { gte: from, lte: to } },
    select: {
      supplierId: true,
      fulfilledAt: true,
      request: { select: { createdAt: true } },
    },
  });

  // Supplier payouts attributable to requests created in the window.
  const earnings = await prisma.supplierEarning.findMany({
    where: { request: { createdAt: { gte: from, lte: to } } },
    select: { supplierId: true, amountKobo: true },
  });

  // Refunds posted in the window.
  const refunds = await prisma.refund.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { amountKobo: true },
  });

  // New customer sign-ups in the window.
  const newUsers = await prisma.user.findMany({
    where: { role: ROLES.CUSTOMER, createdAt: { gte: from, lte: to } },
    select: { id: true, createdAt: true },
  });

  // Ratings left on requests created in the window (scoped supplier reputation).
  const ratings = await prisma.rating.findMany({
    where: { request: { createdAt: { gte: from, lte: to } } },
    select: { supplierId: true, score: true },
  });

  // Approved suppliers and the categories they cover (supply-side of demand).
  const suppliers = await prisma.supplier.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      supplierCategories: { select: { categoryKey: true } },
      offerings: { select: { category: true } },
    },
  });
  const suppliersPerCategory = new Map<string, number>();
  for (const supplier of suppliers) {
    const covered = new Set<string>();
    for (const category of supplier.supplierCategories) {
      covered.add(category.categoryKey);
    }
    for (const offering of supplier.offerings) {
      covered.add(offering.category);
    }
    for (const category of covered) {
      suppliersPerCategory.set(category, (suppliersPerCategory.get(category) ?? 0) + 1);
    }
  }

  // ── Money (kobo sums, serialized to naira) ─────────────────────────────────
  const grossRevenueKobo = paymentsInWindow.reduce(
    (sum, payment) => sum + payment.amountKobo,
    0,
  );
  const refundsKobo = refunds.reduce((sum, refund) => sum + refund.amountKobo, 0);
  const supplierPayoutKobo = earnings.reduce(
    (sum, earning) => sum + earning.amountKobo,
    0,
  );
  const netRevenueKobo = grossRevenueKobo - refundsKobo;
  const grossMarginKobo = grossRevenueKobo - supplierPayoutKobo;
  const grossMarginRate = percentRate(grossMarginKobo, grossRevenueKobo);

  const paidRequestIds = new Set(
    paymentsInWindow.map((payment) => payment.requestId),
  );
  const paidRequests = paidRequestIds.size;
  const totalRequests = requests.length;
  const cancelledRequests = requests.filter(
    (request) => request.status === REQUEST_STATUS.CANCELLED,
  ).length;

  const averageOrderValueNaira = round(
    majorUnitsFromMinor(paidRequests > 0 ? grossRevenueKobo / paidRequests : 0),
  );

  // ── Fulfilment time (hours) ────────────────────────────────────────────────
  const fulfillmentHours = fulfilledRows
    .map((row) => {
      const created = row.request.createdAt.getTime();
      const fulfilled = row.fulfilledAt?.getTime() ?? created;
      return (fulfilled - created) / 3_600_000;
    })
    .filter((hours) => hours >= 0);
  const averageFulfillmentHours = round(
    fulfillmentHours.length > 0
      ? fulfillmentHours.reduce((a, b) => a + b, 0) / fulfillmentHours.length
      : 0,
    1,
  );

  // ── Requests per day ───────────────────────────────────────────────────────
  const requestsPerDay: DailySeriesPoint[] = [];
  const requestBuckets = new Map<string, number>();
  const paidBuckets = new Map<string, number>();
  const signupBuckets = new Map<string, number>();
  for (const request of requests) {
    const key = dayKey(request.createdAt);
    requestBuckets.set(key, (requestBuckets.get(key) ?? 0) + 1);
  }
  for (const payment of paymentsInWindow) {
    const key = dayKey(payment.paidAt ?? payment.createdAt);
    paidBuckets.set(key, (paidBuckets.get(key) ?? 0) + 1);
  }
  for (const user of newUsers) {
    const key = dayKey(user.createdAt);
    signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
  }
  for (let offset = clamped - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000);
    const key = dayKey(date);
    requestsPerDay.push({
      date: key,
      requests: requestBuckets.get(key) ?? 0,
      paid: paidBuckets.get(key) ?? 0,
      newCustomers: signupBuckets.get(key) ?? 0,
    });
  }

  // ── Category demand ────────────────────────────────────────────────────────
  const categoryAgg = new Map<
    string,
    { requests: number; paid: number; cancelled: number; open: number; revenueKobo: number }
  >();
  for (const request of requests) {
    const entry = categoryAgg.get(request.category) ?? {
      requests: 0,
      paid: 0,
      cancelled: 0,
      open: 0,
      revenueKobo: 0,
    };
    entry.requests += 1;
    if (paidRequestIds.has(request.id)) {
      entry.paid += 1;
    }
    if (request.status === REQUEST_STATUS.CANCELLED) {
      entry.cancelled += 1;
    } else if (
      request.status === REQUEST_STATUS.REQUESTED ||
      request.status === REQUEST_STATUS.RESEARCHING ||
      request.status === REQUEST_STATUS.OPTIONS_FOUND ||
      request.status === REQUEST_STATUS.AWAITING_CUSTOMER ||
      request.status === REQUEST_STATUS.APPROVED ||
      request.status === REQUEST_STATUS.PAYMENT_PENDING
    ) {
      entry.open += 1;
    }
    categoryAgg.set(request.category, entry);
  }
  for (const payment of paymentsInWindow) {
    const entry = categoryAgg.get(payment.request.category);
    if (entry) {
      entry.revenueKobo += payment.amountKobo;
    }
  }
  const categoryDemand: CategoryDemandRow[] = [...categoryAgg.entries()]
    .map(([category, entry]) => ({
      category,
      label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
      requests: entry.requests,
      paid: entry.paid,
      cancelled: entry.cancelled,
      open: entry.open,
      conversionRate: percentRate(entry.paid, entry.requests),
      revenueNaira: round(majorUnitsFromMinor(entry.revenueKobo)),
    }))
    .sort((a, b) => b.revenueNaira - a.revenueNaira || b.requests - a.requests);

  // ── Supplier performance ───────────────────────────────────────────────────
  const suppliersInWindow = new Set(
    fulfilledRows.map((row) => row.supplierId),
  );
  const earnedBySupplier = new Map<string, number>();
  for (const earning of earnings) {
    earnedBySupplier.set(
      earning.supplierId,
      (earnedBySupplier.get(earning.supplierId) ?? 0) + earning.amountKobo,
    );
  }
  for (const supplierId of earnedBySupplier.keys()) {
    suppliersInWindow.add(supplierId);
  }

  const completedBySupplier = new Map<string, number>();
  for (const row of fulfilledRows) {
    completedBySupplier.set(
      row.supplierId,
      (completedBySupplier.get(row.supplierId) ?? 0) + 1,
    );
  }

  const ratingBySupplier = new Map<string, number[]>();
  for (const rating of ratings) {
    const bucket = ratingBySupplier.get(rating.supplierId) ?? [];
    bucket.push(rating.score);
    ratingBySupplier.set(rating.supplierId, bucket);
  }

  const suppliersInfo = await prisma.supplier.findMany({
    where: { id: { in: [...suppliersInWindow] } },
    select: { id: true, businessName: true },
  });
  const nameBySupplierId = new Map(
    suppliersInfo.map((supplier) => [supplier.id, supplier.businessName]),
  );

  const supplierPerformance: SupplierPerformanceRow[] = [];
  for (const supplierId of suppliersInWindow) {
    const scores = ratingBySupplier.get(supplierId) ?? [];
    const reliability = await supplierReliability(supplierId);
    supplierPerformance.push({
      supplierId,
      businessName: nameBySupplierId.get(supplierId) ?? "Unknown supplier",
      completed: completedBySupplier.get(supplierId) ?? 0,
      earnedNaira: round(
        majorUnitsFromMinor(earnedBySupplier.get(supplierId) ?? 0),
      ),
      avgRating:
        scores.length > 0
          ? round(scores.reduce((a, b) => a + b, 0) / scores.length, 1)
          : null,
      reliabilityScore: reliability.score,
      reliabilityBand: reliability.band,
    });
  }
  supplierPerformance.sort((a, b) => b.earnedNaira - a.earnedNaira);

  // ── Repeat customers + acquisition ────────────────────────────────────────
  const paymentsByCustomer = new Map<string, number>();
  const firstPaidAtByCustomer = new Map<string, Date>();
  for (const payment of capturedPayments) {
    if (!payment.paidAt) {
      continue;
    }
    if (payment.paidAt >= from && payment.paidAt <= to) {
      paymentsByCustomer.set(
        payment.customerId,
        (paymentsByCustomer.get(payment.customerId) ?? 0) + 1,
      );
    }
    const first = firstPaidAtByCustomer.get(payment.customerId);
    if (!first || payment.paidAt < first) {
      firstPaidAtByCustomer.set(payment.customerId, payment.paidAt);
    }
  }
  const payingCustomers = paymentsByCustomer.size;
  const repeatCustomers = [...paymentsByCustomer.values()].filter(
    (count) => count >= 2,
  ).length;
  const oneTimeCustomers = payingCustomers - repeatCustomers;
  const newBuyers = [...paymentsByCustomer.keys()].filter(
    (customerId) =>
      firstPaidAtByCustomer.get(customerId)! >= from &&
      firstPaidAtByCustomer.get(customerId)! <= to,
  ).length;

  // ── Unmet demand (never converted to a captured payment) ─────────────────
  const unmetRequests = requests.filter(
    (request) => !paidRequestIds.has(request.id),
  );
  const unmetByCategory = new Map<
    string,
    { cancelled: number; open: number; budgetKobo: number }
  >();
  const itemCounts = new Map<string, number>();
  for (const request of unmetRequests) {
    const entry = unmetByCategory.get(request.category) ?? {
      cancelled: 0,
      open: 0,
      budgetKobo: 0,
    };
    if (request.status === REQUEST_STATUS.CANCELLED) {
      entry.cancelled += 1;
    } else {
      entry.open += 1;
    }
    entry.budgetKobo += request.budgetKobo ?? 0;
    unmetByCategory.set(request.category, entry);

    for (const item of request.items) {
      const name = item.name.trim().toLowerCase().replace(/\.+$/, "");
      if (name.length === 0) {
        continue;
      }
      itemCounts.set(name, (itemCounts.get(name) ?? 0) + 1);
    }
  }
  const unmetByCategoryRows: UnmetCategoryRow[] = [...unmetByCategory.entries()]
    .map(([category, entry]) => ({
      category,
      label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category,
      cancelled: entry.cancelled,
      open: entry.open,
      total: entry.cancelled + entry.open,
      budgetNaira: round(majorUnitsFromMinor(entry.budgetKobo)),
      activeSuppliers: suppliersPerCategory.get(category) ?? 0,
    }))
    .sort(
      (a, b) => b.budgetNaira - a.budgetNaira || b.total - a.total || b.open - a.open,
    );

  const topItems = [...itemCounts.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const examples: UnmetExample[] = [...unmetRequests]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6)
    .map((request) => ({
      requestReference: request.reference,
      summary: request.summary,
      category: request.category,
      categoryLabel:
        CATEGORY_LABELS[request.category as keyof typeof CATEGORY_LABELS] ?? request.category,
      status: request.status,
      statusLabel: requestStatusLabel(request.status),
      location: request.location,
      budgetNaira:
        request.budgetKobo === null ? null : round(majorUnitsFromMinor(request.budgetKobo)),
    }));

  return {
    window: { days: clamped, from: from.toISOString(), to: to.toISOString() },
    summary: {
      requests: {
        total: totalRequests,
        perDay: round(totalRequests / clamped, 2),
      },
      paidRequests,
      conversionRate: percentRate(paidRequests, totalRequests),
      averageOrderValueNaira,
      revenue: {
        grossNaira: round(majorUnitsFromMinor(grossRevenueKobo)),
        refundsNaira: round(majorUnitsFromMinor(refundsKobo)),
        netNaira: round(majorUnitsFromMinor(netRevenueKobo)),
        supplierPayoutNaira: round(majorUnitsFromMinor(supplierPayoutKobo)),
        grossMarginNaira: round(majorUnitsFromMinor(grossMarginKobo)),
        grossMarginRate,
      },
      cancellationRate: percentRate(cancelledRequests, totalRequests),
      averageFulfillmentHours,
      fulfillmentCount: fulfillmentHours.length,
    },
    requestsPerDay,
    categoryDemand,
    supplierPerformance,
    customers: {
      payingCustomers,
      oneTimeCustomers,
      repeatCustomers,
      repeatPurchaseRate: percentRate(repeatCustomers, payingCustomers),
      newUsers: newUsers.length,
      newBuyers,
      buyerConversionRate: percentRate(newBuyers, newUsers.length),
    },
    unmetDemand: {
      totalRequests: unmetRequests.length,
      budgetNaira: round(
        majorUnitsFromMinor(
          unmetRequests.reduce((sum, request) => sum + (request.budgetKobo ?? 0), 0),
        ),
      ),
      byCategory: unmetByCategoryRows,
      topItems,
      examples,
    },
  };
}