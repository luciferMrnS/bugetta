import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { ROLES } from "@/lib/auth/roles";
import { getRequestForOperations } from "@/lib/operations/service";
import { formatNaira } from "@/lib/money";
import { RequestStatusBadge } from "@/components/RequestStatusBadge";
import { StatusChanger } from "@/components/operations/StatusChanger";
import { OptionForm } from "@/components/operations/OptionForm";
import { QuoteForm } from "@/components/operations/QuoteForm";
import { SupplierMatches } from "@/components/operations/SupplierMatches";
import { DeliveryCard } from "@/components/operations/DeliveryCard";
import { requestStatusLabel } from "@/lib/requests/status";

export const dynamic = "force-dynamic";

export default async function OperationsRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== ROLES.OPERATIONS && session.user.role !== ROLES.ADMIN) {
    redirect("/");
  }

  const { id } = await params;
  const request = await getRequestForOperations(id);
  if (!request) {
    notFound();
  }

  const deadline = request.deliveryDeadline
    ? new Date(request.deliveryDeadline).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-6">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/operations"
            className="text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
          >
            ← Operations dashboard
          </Link>
        </nav>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <RequestStatusBadge status={request.status} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {request.reference}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {request.operatorStatusLabel}
            </span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {request.summary}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            From {request.customer.name}
            {request.customer.phone ? ` · ${request.customer.phone}` : ""} ·{" "}
            {request.customer.email} · requested{" "}
            {new Date(request.createdAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <StatusChanger
          requestId={request.id}
          current={request.status}
          allowed={request.allowedTransitions}
        />

        <DeliveryCard
          requestId={request.id}
          defaultLocation={request.location}
        />

        <section
          aria-label="Status history"
          className="flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/10"
        >
          <h2 className="text-lg font-semibold tracking-tight">Status history</h2>
          {request.statusEvents.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No transitions recorded yet.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-black/5 dark:divide-white/5">
              {request.statusEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="flex items-center gap-2 text-sm">
                    {event.fromStatus ? (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {requestStatusLabel(event.fromStatus)}
                      </span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Created
                      </span>
                    )}
                    <span aria-hidden="true">→</span>
                    <span className="font-medium">{event.toStatusLabel}</span>
                  </div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {event.causeLabel}
                    {event.actorRole ? ` · ${event.actorRole}` : ""} ·{" "}
                    {new Date(event.createdAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {request.payments.length > 0 && (
          <section
            aria-label="Payments"
            className="flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/10"
          >
            <h2 className="text-lg font-semibold tracking-tight">Payments</h2>
            <ul className="flex flex-col gap-3">
              {request.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {payment.reference}
                      <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                        {payment.provider}
                      </span>
                    </span>
                    <span className="text-sm font-bold">
                      {formatNaira(payment.amountNaira * 100)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{payment.statusLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>ref {payment.providerReference}</span>
                    {payment.paidAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          paid{" "}
                          {new Date(payment.paidAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    )}
                    {payment.failedAt && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          failed{" "}
                          {new Date(payment.failedAt).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    )}
                  </div>

                  {payment.transactions.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-2 text-xs dark:border-white/5">
                      {payment.transactions.map((tx) => (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {tx.type} · {tx.reference} · {tx.status}
                          </span>
                          <span className="font-medium">
                            {formatNaira(tx.amountNaira * 100)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {payment.refunds.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-2 text-xs dark:border-white/5">
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        Refunds
                      </span>
                      {payment.refunds.map((refund) => (
                        <div
                          key={refund.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {refund.reference}
                            {refund.reason ? ` · ${refund.reason}` : ""}
                          </span>
                          <span className="font-medium">
                            {formatNaira(refund.amountNaira * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-label="Request details"
          className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow label="Category" value={request.categoryLabel} />
            <DetailRow
              label="Budget"
              value={
                request.budgetNaira === null
                  ? "Not specified"
                  : formatNaira(request.budgetNaira * 100)
              }
            />
            <DetailRow label="Quantity" value={request.quantity ?? "Not specified"} />
            <DetailRow label="Needed by" value={deadline ?? "Not specified"} />
            <DetailRow label="Location" value={request.location ?? "Not specified"} wide />
          </div>

          {request.instructions && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Additional instructions
              </span>
              <span className="whitespace-pre-wrap text-sm leading-6">
                {request.instructions}
              </span>
            </div>
          )}

          {request.items.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Items</span>
              <ul className="flex flex-col divide-y divide-black/5 rounded-xl border border-black/5 dark:divide-white/5 dark:border-white/5">
                {request.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {item.quantity ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Customer&apos;s description
            </span>
            <span className="whitespace-pre-wrap rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm leading-6 dark:border-white/5 dark:bg-white/[0.03]">
              {request.description}
            </span>
          </div>
        </section>

        <SupplierMatches requestId={request.id} />

        <section
          aria-label="Customer quotes"
          className="flex flex-col gap-3"
        >
          <h2 className="text-lg font-semibold tracking-tight">Quotes sent</h2>
          {request.quotes.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No quotes sent yet. Quote one of the options below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {request.quotes.map((quote) => (
                <li
                  key={quote.id}
                  className="rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{quote.productName}</span>
                    <span className="text-sm font-semibold">
                      {formatNaira(quote.totalNaira * 100)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{quote.statusLabel}</span>
                    {quote.estimatedDelivery && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>~{quote.estimatedDelivery}</span>
                      </>
                    )}
                    {quote.validUntil && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          valid until{" "}
                          {new Date(quote.validUntil).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>
                      sent{" "}
                      {new Date(quote.createdAt).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">Price</dt>
                      <dd className="font-medium">
                        {formatNaira(quote.priceNaira * 100)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">
                        Service fee
                      </dt>
                      <dd className="font-medium">
                        {formatNaira(quote.serviceFeeNaira * 100)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">
                        Delivery fee
                      </dt>
                      <dd className="font-medium">
                        {formatNaira(quote.deliveryFeeNaira * 100)}
                      </dd>
                    </div>
                  </dl>
                  {quote.information && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                        Info:{" "}
                      </span>
                      {quote.information}
                    </p>
                  )}
                  {quote.images.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {quote.images.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-black/10 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-zinc-400 dark:hover:bg-white/5"
                          >
                            {new URL(url).hostname}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {quote.terms && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {quote.terms}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Supplier options" className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Options</h2>
          {request.options.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No options yet. Add the first supplier option below.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {request.options.map((option) => (
                <li
                  key={option.id}
                  className="rounded-2xl border border-black/10 p-4 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">
                        {option.supplier}
                        <span className="text-zinc-400"> — </span>
                        {option.productName}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {option.availability ?? "Availability not set"}
                        {option.estimatedDelivery
                          ? ` · ~${option.estimatedDelivery}`
                          : ""}
                      </span>
                    </div>
                    <span className="text-sm font-semibold">
                      {option.priceNaira === null
                        ? "Unpriced"
                        : formatNaira(option.priceNaira * 100)}
                    </span>
                  </div>

                  {option.notes && (
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                        Notes:{" "}
                      </span>
                      {option.notes}
                    </p>
                  )}
                  {option.terms && (
                    <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                        Terms:{" "}
                      </span>
                      {option.terms}
                    </p>
                  )}

                  <div className="mt-3">
                    <QuoteForm
                      requestId={request.id}
                      prefill={{
                        optionId: option.id,
                        productName: option.productName,
                        priceNaira: option.priceNaira,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2">
            <OptionForm requestId={request.id} />
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailRow({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}