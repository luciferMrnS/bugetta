import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session.cookies";
import { getRequestForUser } from "@/lib/requests/service";
import { RequestStatusBadge } from "@/components/RequestStatusBadge";
import { formatNaira } from "@/lib/money";
import { QuoteDecision, AskAnotherButton } from "@/components/customer/QuoteDecision";
import {
  CheckoutSection,
  PaymentReceived,
} from "@/components/customer/CheckoutSection";
import { REQUEST_STATUS } from "@/lib/requests/status";
import { OrderTimeline } from "@/components/customer/OrderTimeline";
import { DeliveryTracker } from "@/components/customer/DeliveryTracker";
import { OrderFeedback } from "@/components/customer/OrderFeedback";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const request = await getRequestForUser(session.user.id, id);
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

  const pendingQuotes = request.quotes.filter((q) => q.status === "PENDING");
  const approvedQuote =
    request.status === REQUEST_STATUS.PAID ||
    request.status === REQUEST_STATUS.PAYMENT_PENDING ||
    request.status === REQUEST_STATUS.APPROVED
      ? request.quotes.find((q) => q.status === "ACCEPTED") ?? null
      : null;

  const showCheckout =
    (request.status === REQUEST_STATUS.APPROVED && !request.payment) ||
    (request.status === REQUEST_STATUS.PAYMENT_PENDING &&
      (!request.payment ||
        request.payment.status === "PENDING" ||
        request.payment.status === "FAILED"));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <div className="flex flex-col gap-6">
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link
            href="/requests"
            className="text-zinc-500 transition-colors hover:text-foreground dark:text-zinc-400"
          >
            ← My requests
          </Link>
        </nav>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <RequestStatusBadge status={request.status} />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {request.reference}
            </span>
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {request.summary}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Requested{" "}
            {new Date(request.createdAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Customer decision UI: choose between offered options */}
        {request.status === "AWAITING_CUSTOMER" &&
          pendingQuotes.length > 0 && (
            <QuoteDecision requestId={request.id} quotes={pendingQuotes} />
          )}

        {/* Order timeline: every step the request has come through */}
        <section
          aria-label="Order timeline"
          className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
        >
          <h2 className="text-lg font-semibold tracking-tight">
            Order timeline
          </h2>
          <div className="mt-4">
            <OrderTimeline
              currentStatus={request.status}
              statusEvents={request.statusEvents}
            />
          </div>
        </section>

        {/* Empty state: no pending offers left but still awaiting customer */}
        {request.status === "AWAITING_CUSTOMER" &&
          pendingQuotes.length === 0 && (
            <section className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 dark:border-amber-400/30 dark:bg-amber-400/5">
              <h2 className="text-lg font-semibold tracking-tight">
                No offers available right now
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Ask us to find another option for you.
              </p>
              <AskAnotherButton requestId={request.id} />
            </section>
          )}

        {/* Approved / locked-in quote after customer selection */}
        {approvedQuote && (
          <section
            aria-label="Approved option"
            className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 dark:border-emerald-400/30 dark:bg-emerald-400/5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Option approved
              </h2>
              <span className="text-lg font-bold">
                {formatNaira(approvedQuote.totalNaira * 100)}
              </span>
            </div>
            <p className="text-sm font-medium">
              {approvedQuote.productName}
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">Price</dt>
                <dd className="font-medium">
                  {formatNaira(approvedQuote.priceNaira * 100)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">
                  Service fee
                </dt>
                <dd className="font-medium">
                  {formatNaira(approvedQuote.serviceFeeNaira * 100)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-600 dark:text-zinc-400">
                  Delivery fee
                </dt>
                <dd className="font-medium">
                  {formatNaira(approvedQuote.deliveryFeeNaira * 100)}
                </dd>
              </div>
              {approvedQuote.estimatedDelivery && (
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">
                    Estimated delivery
                  </dt>
                  <dd className="font-medium">
                    {approvedQuote.estimatedDelivery}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Payment: checkout before capture, confirmation once paid */}
        {showCheckout && approvedQuote && (
          <CheckoutSection
            requestId={request.id}
            amountNaira={approvedQuote.totalNaira}
            productName={approvedQuote.productName}
          />
        )}
        {request.status === REQUEST_STATUS.PAID &&
          approvedQuote &&
          request.payment &&
          request.payment.status === "PAID" && (
            <PaymentReceived
              amountNaira={approvedQuote.totalNaira}
              productName={approvedQuote.productName}
            />
          )}

        <DeliveryTracker requestId={request.id} />

        <OrderFeedback requestId={request.id} />

        <section
          aria-label="Structured request"
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
            <DetailRow
              label="Quantity"
              value={request.quantity ?? "Not specified"}
            />
            <DetailRow
              label="Needed by"
              value={deadline ?? "Not specified"}
            />
            <DetailRow
              label="Location"
              value={request.location ?? "Not specified"}
              wide
            />
          </div>

          {request.instructions && (
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Additional instructions
              </dt>
              <dd className="text-sm leading-6">{request.instructions}</dd>
            </div>
          )}

          {request.items.length > 0 && (
            <div className="flex flex-col gap-2">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Items
              </dt>
              <ul className="flex flex-col divide-y divide-black/5 rounded-xl border border-black/5 dark:divide-white/5 dark:border-white/5">
                {request.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      {item.quantity ??
                        (request.quantity === null ? "" : "—")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {request.images.length > 0 && (
            <div className="flex flex-col gap-2">
              <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                Reference images
              </dt>
              <ul className="flex flex-wrap gap-2">
                {request.images.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-black/10 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                    >
                      {new URL(url).hostname}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">
              Your description
            </dt>
            <dd className="whitespace-pre-wrap rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm leading-6 dark:border-white/5 dark:bg-white/[0.03]">
              {request.description}
            </dd>
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
      <dt className="text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}