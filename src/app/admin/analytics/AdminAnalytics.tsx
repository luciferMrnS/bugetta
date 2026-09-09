"use client";

import { useCallback, useEffect, useState } from "react";

interface WindowInfo {
  days: number;
  from: string;
  to: string;
}

interface CategoryDemand {
  category: string;
  label: string;
  requests: number;
  paid: number;
  cancelled: number;
  open: number;
  conversionRate: number;
  revenueNaira: number;
}

interface SupplierPerformance {
  supplierId: string;
  businessName: string;
  completed: number;
  earnedNaira: number;
  avgRating: number | null;
  reliabilityScore: number;
  reliabilityBand: string;
}

interface UnmetCategory {
  category: string;
  label: string;
  cancelled: number;
  open: number;
  total: number;
  budgetNaira: number;
  activeSuppliers: number;
}

interface UnmetExample {
  requestReference: string;
  summary: string;
  category: string;
  categoryLabel: string;
  status: string;
  statusLabel: string;
  location: string | null;
  budgetNaira: number | null;
}

interface DailyPoint {
  date: string;
  requests: number;
  paid: number;
  newCustomers: number;
}

interface Dashboard {
  window: WindowInfo;
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
  requestsPerDay: DailyPoint[];
  categoryDemand: CategoryDemand[];
  supplierPerformance: SupplierPerformance[];
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
    byCategory: UnmetCategory[];
    topItems: Array<{ item: string; count: number }>;
    examples: UnmetExample[];
  };
}

const WINDOWS = [7, 30, 90];

function naira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number): string {
  return `${value}%`;
}

// Admin analytics: business intelligence over the stored ledger. Read-only —
// every number is computed on the server from payments, requests, refunds,
// supplier earnings and ratings; nothing here records data.
export function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch(`/api/admin/analytics?days=${days}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          data?: Dashboard;
          error?: { message?: string };
        };
        if (!res.ok || !json.data) {
          throw new Error(json.error?.message ?? "Could not load analytics.");
        }
        setError(null);
        return json.data;
      })
      .then(setData)
      .catch((cause: Error) => setError(cause.message));
  }, [days]);

  useEffect(() => {
    reload();
  }, [reload]);

  const maxDaily = Math.max(
    1,
    ...(data?.requestsPerDay.map((point) => point.requests) ?? [1]),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Business intelligence across the marketplace ledger.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-black/10 p-1 dark:border-white/10">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => setDays(window)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  days === window
                    ? "bg-foreground text-background"
                    : "text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {window} days
              </button>
            ))}
          </div>
        </header>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {data === null && !error && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Loading analytics…
          </p>
        )}

        {data && (
          <>
            <section
              aria-label="Key metrics"
              className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            >
              <MetricCard
                label="Requests"
                value={String(data.summary.requests.total)}
                hint={`${data.summary.requests.perDay}/day`}
              />
              <MetricCard
                label="Conversion rate"
                value={percent(data.summary.conversionRate)}
                hint={`${data.summary.paidRequests} paid`}
              />
              <MetricCard
                label="Avg order value"
                value={naira(data.summary.averageOrderValueNaira)}
              />
              <MetricCard
                label="Gross revenue"
                value={naira(data.summary.revenue.grossNaira)}
                hint={`${naira(data.summary.revenue.netNaira)} net`}
              />
              <MetricCard
                label="Gross margin"
                value={percent(data.summary.revenue.grossMarginRate)}
                hint={naira(data.summary.revenue.grossMarginNaira)}
              />
              <MetricCard
                label="Cancellation rate"
                value={percent(data.summary.cancellationRate)}
              />
              <MetricCard
                label="Avg fulfilment"
                value={`${data.summary.averageFulfillmentHours}h`}
                hint={`${data.summary.fulfillmentCount} orders`}
              />
              <MetricCard
                label="Supplier payouts"
                value={naira(data.summary.revenue.supplierPayoutNaira)}
                hint={`${naira(data.summary.revenue.refundsNaira)} refunded`}
              />
            </section>

            <section aria-label="Requests per day" className="flex flex-col gap-2">
              <SectionTitle
                title="Requests per day"
                subtitle="Requests, paid orders and new customers by calendar day."
              />
              <div className="flex flex-col gap-1.5">
                {data.requestsPerDay.map((point) => (
                  <div
                    key={point.date}
                    className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-xs"
                  >
                    <span className="text-zinc-500">{point.date}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                        <div
                          className="h-full bg-foreground/80"
                          style={{
                            width: `${(point.requests / maxDaily) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-5 text-right font-medium">
                        {point.requests}
                      </span>
                    </div>
                    <span className="w-20 text-right tabular-nums text-zinc-500">
                      {point.paid} paid · {point.newCustomers} new
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section aria-label="Category demand" className="flex flex-col gap-2">
              <SectionTitle
                title="Category demand"
                subtitle="What buyers ask for, what converts, and where the money lands."
              />
              {data.categoryDemand.length === 0 ? (
                <EmptyState text="No requests in this window." />
              ) : (
                <Table
                  head={["Category", "Requests", "Paid", "Conversion", "Revenue"]}
                >
                  {data.categoryDemand.map((row) => (
                    <tr key={row.category}>
                      <Cell>
                        <span className="font-medium">{row.label}</span>
                        <span className="text-xs text-zinc-400">
                          {" "}· {row.open} open · {row.cancelled} cancelled
                        </span>
                      </Cell>
                      <Cell>{row.requests}</Cell>
                      <Cell>{row.paid}</Cell>
                      <Cell>{percent(row.conversionRate)}</Cell>
                      <Cell className="text-right">{naira(row.revenueNaira)}</Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </section>

            {data.supplierPerformance.length > 0 && (
              <section
                aria-label="Supplier performance"
                className="flex flex-col gap-2"
              >
                <SectionTitle
                  title="Supplier performance"
                  subtitle="Fulfilment, earnings, ratings and reliability for suppliers active in the window."
                />
                <Table head={["Supplier", "Fulfilled", "Earned", "Rating", "Reliability"]}>
                  {data.supplierPerformance.map((row) => (
                    <tr key={row.supplierId}>
                      <Cell>
                        <span className="font-medium">{row.businessName}</span>
                      </Cell>
                      <Cell>{row.completed}</Cell>
                      <Cell>{naira(row.earnedNaira)}</Cell>
                      <Cell>{row.avgRating === null ? "—" : row.avgRating}</Cell>
                      <Cell>
                        {row.reliabilityScore} · {row.reliabilityBand}
                      </Cell>
                    </tr>
                  ))}
                </Table>
              </section>
            )}

            <section aria-label="Customers" className="flex flex-col gap-2">
              <SectionTitle
                title="Customers"
                subtitle="Repeat-purchase behaviour and acquisition in this window."
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  label="Paying customers"
                  value={String(data.customers.payingCustomers)}
                  hint={`${data.customers.oneTimeCustomers} one-time`}
                />
                <MetricCard
                  label="Repeat purchase rate"
                  value={percent(data.customers.repeatPurchaseRate)}
                  hint={`${data.customers.repeatCustomers} repeat`}
                />
                <MetricCard
                  label="New signups"
                  value={String(data.customers.newUsers)}
                />
                <MetricCard
                  label="New buyers"
                  value={String(data.customers.newBuyers)}
                  hint={`${percent(data.customers.buyerConversionRate)} convert`}
                />
              </div>
            </section>

            <section aria-label="Unmet demand" className="flex flex-col gap-2">
              <SectionTitle
                title="Unmet demand"
                subtitle={`${data.unmetDemand.totalRequests} requests never converted (${naira(
                  data.unmetDemand.budgetNaira,
                )} of stated budgets) — where supply is missing.`}
              />
              {data.unmetDemand.byCategory.length === 0 ? (
                <EmptyState text="Every request in this window converted to a paid order." />
              ) : (
                <Table
                  head={[
                    "Category",
                    "Cancelled",
                    "Open",
                    "Total",
                    "Budget",
                    "Active suppliers",
                  ]}
                >
                  {data.unmetDemand.byCategory.map((row) => (
                    <tr key={row.category}>
                      <Cell>
                        <span className="font-medium">{row.label}</span>
                      </Cell>
                      <Cell>{row.cancelled}</Cell>
                      <Cell>{row.open}</Cell>
                      <Cell>{row.total}</Cell>
                      <Cell>{naira(row.budgetNaira)}</Cell>
                      <Cell>
                        {row.activeSuppliers === 0 ? (
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            No supplier — recruit
                          </span>
                        ) : (
                          <span>{row.activeSuppliers}</span>
                        )}
                      </Cell>
                    </tr>
                  ))}
                </Table>
              )}

              {data.unmetDemand.topItems.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.unmetDemand.topItems.map((item) => (
                    <span
                      key={item.item}
                      className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium dark:border-white/15"
                    >
                      {item.item} · {item.count}
                    </span>
                  ))}
                </div>
              )}

              {data.unmetDemand.examples.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {data.unmetDemand.examples.map((example) => (
                    <li
                      key={example.requestReference}
                      className="rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/10"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">{example.summary}</span>
                        <span className="text-xs text-zinc-400">
                          {example.requestReference} · {example.statusLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {example.categoryLabel}
                        {example.location ? ` · ${example.location}` : ""}
                        {example.budgetNaira !== null
                          ? ` · budget ${naira(example.budgetNaira)}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="pt-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        {subtitle}
      </p>
    </header>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15">
      {text}
    </p>
  );
}

function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-zinc-400 dark:border-white/5">
            {head.map((label) => (
              <th key={label} className="px-4 py-2.5 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}