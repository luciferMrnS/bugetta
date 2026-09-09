"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface QuoteDecisionProps {
  requestId: string;
  quotes: Array<{
    id: string;
    productName: string;
    priceNaira: number;
    serviceFeeNaira: number;
    deliveryFeeNaira: number;
    totalNaira: number;
    information: string | null;
    images: string[];
    estimatedDelivery: string | null;
    terms: string | null;
    validUntil: string | null;
  }>;
}

function formatMoney(naira: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(naira);
}

export function QuoteDecision({ requestId, quotes }: QuoteDecisionProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(quoteId: string, action: string) {
    setError(null);
    setPendingAction(`${quoteId}:${action}`);
    try {
      const res = await fetch(`/api/requests/${requestId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, action }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || "Something went wrong.");
      }
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      aria-label="Available options"
      className="flex flex-col gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 dark:border-emerald-400/30 dark:bg-emerald-400/5"
    >
      <h2 className="text-lg font-semibold tracking-tight">
        We found {quotes.length} {quotes.length === 1 ? "option" : "options"}{" "}
        for you.
      </h2>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {quotes.map((quote) => {
          const isHandling = pendingAction === `${quote.id}:SELECT`;
          const isRejecting = pendingAction === `${quote.id}:REJECT`;
          const busy = !!pendingAction;

          return (
            <article
              key={quote.id}
              className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{quote.productName}</h3>
                <span className="text-lg font-bold whitespace-nowrap">
                  {formatMoney(quote.totalNaira)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">Price</dt>
                  <dd className="font-medium">{formatMoney(quote.priceNaira)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">
                    Service fee
                  </dt>
                  <dd className="font-medium">
                    {formatMoney(quote.serviceFeeNaira)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">
                    Delivery fee
                  </dt>
                  <dd className="font-medium">
                    {formatMoney(quote.deliveryFeeNaira)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600 dark:text-zinc-400">
                    Estimated delivery
                  </dt>
                  <dd className="font-medium">
                    {quote.estimatedDelivery ?? "—"}
                  </dd>
                </div>
                {quote.validUntil && (
                  <div className="col-span-2">
                    <dt className="text-zinc-600 dark:text-zinc-400">
                      Offer valid until
                    </dt>
                    <dd className="font-medium">
                      {new Date(quote.validUntil).toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </dd>
                  </div>
                )}
              </dl>

              {quote.information && (
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                    Relevant information
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm leading-6">
                    {quote.information}
                  </dd>
                </div>
              )}

              {quote.images.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {quote.images.map((url) => (
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
              )}

              {quote.terms && (
                <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {quote.terms}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(quote.id, "SELECT")}
                  className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isHandling ? "Selecting…" : "Select"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(quote.id, "REJECT")}
                  className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
                >
                  {isRejecting ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="pt-2">
        <AskAnotherButton requestId={requestId} disabled={!!pendingAction} />
      </div>
    </section>
  );
}

export function AskAnotherButton({
  requestId,
  disabled,
}: {
  requestId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: "0",
          action: "REQUEST_ANOTHER",
        }),
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={ask}
      className="inline-flex h-9 items-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
    >
      {busy ? "Requesting…" : "Ask for another option"}
    </button>
  );
}
