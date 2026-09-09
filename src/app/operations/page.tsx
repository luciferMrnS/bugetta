import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { listRequestsForOperations } from "@/lib/operations/service";
import {
  REQUEST_STATUS,
  OPERATOR_STATUS_LABELS,
  type RequestStatusKey,
} from "@/lib/requests/status";
import { formatNaira } from "@/lib/money";
import type { OperationRequestCard } from "@/lib/operations/serialize";

export const dynamic = "force-dynamic";

const INBOUND_COLUMNS: RequestStatusKey[] = [
  REQUEST_STATUS.REQUESTED,
  REQUEST_STATUS.RESEARCHING,
  REQUEST_STATUS.OPTIONS_FOUND,
  REQUEST_STATUS.AWAITING_CUSTOMER,
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.PAYMENT_PENDING,
];

const FULFILLMENT_COLUMNS: RequestStatusKey[] = [
  REQUEST_STATUS.PAID,
  REQUEST_STATUS.FULFILLMENT_PENDING,
  REQUEST_STATUS.PROCESSING,
  REQUEST_STATUS.OUT_FOR_DELIVERY,
  REQUEST_STATUS.DELIVERED,
  REQUEST_STATUS.COMPLETED,
];

const CONCERN_COLUMNS: RequestStatusKey[] = [
  REQUEST_STATUS.CANCELLED,
  REQUEST_STATUS.REFUNDED,
  REQUEST_STATUS.DISPUTED,
];

function RequestCard({ request }: { request: OperationRequestCard }) {
  return (
    <li>
      <Link
        href={`/operations/requests/${request.id}`}
        className="flex flex-col gap-1 rounded-xl border border-black/5 bg-black/[0.02] p-3 transition-colors hover:bg-black/[0.05] dark:border-white/5 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
      >
        <span className="line-clamp-2 text-sm font-medium">{request.summary}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {request.reference} · {request.customerName}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{request.categoryLabel}</span>
          {request.budgetNaira !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatNaira(request.budgetNaira * 100)}</span>
            </>
          )}
          {request.location && (
            <>
              <span aria-hidden="true">·</span>
              <span>{request.location}</span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

function StatusGrid({
  title,
  subtitle,
  columns,
  byStatus,
}: {
  title: string;
  subtitle: string;
  columns: RequestStatusKey[];
  byStatus: Map<RequestStatusKey, OperationRequestCard[]>;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {columns.map((status) => {
          const cards = byStatus.get(status) ?? [];
          return (
            <div
              key={status}
              aria-label={OPERATOR_STATUS_LABELS[status]}
              className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <header className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {OPERATOR_STATUS_LABELS[status]}
                </h3>
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {cards.length}
                </span>
              </header>

              {cards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-black/10 px-3 py-5 text-center text-xs text-zinc-400 dark:border-white/10">
                  Nothing here yet
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((request) => (
                    <RequestCard key={request.id} request={request} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function OperationsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.OPERATIONS && session.user.role !== ROLES.ADMIN) {
    redirect("/");
  }

  const requests = await listRequestsForOperations();
  const byStatus = new Map<RequestStatusKey, OperationRequestCard[]>();
  const allColumns = [
    ...INBOUND_COLUMNS,
    ...FULFILLMENT_COLUMNS,
    ...CONCERN_COLUMNS,
  ];
  for (const column of allColumns) {
    byStatus.set(column, []);
  }
  for (const request of requests) {
    const bucket = byStatus.get(request.status as RequestStatusKey);
    if (bucket) {
      bucket.push(request);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Operations dashboard
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every request from intake through fulfilment — inbound, in-flight and
          concerns are tracked separately.
        </p>
        <Link
          href="/operations/automation"
          className="mt-1 self-start text-sm text-zinc-500 underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Automation ledger
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-10">
        <StatusGrid
          title="Inbound &amp; decisions"
          subtitle="Requests being researched and waiting for the customer to choose."
          columns={INBOUND_COLUMNS}
          byStatus={byStatus}
        />
        <StatusGrid
          title="Fulfilment"
          subtitle="Paid orders being processed, dispatched and delivered."
          columns={FULFILLMENT_COLUMNS}
          byStatus={byStatus}
        />
        <StatusGrid
          title="Concerns"
          subtitle="Cancelled, refunded and disputed orders for review."
          columns={CONCERN_COLUMNS}
          byStatus={byStatus}
        />
      </div>
    </main>
  );
}