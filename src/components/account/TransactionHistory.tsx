"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface Transaction {
  id: string;
  type: "CHARGE" | "REFUND" | "EARNING";
  reference: string;
  amountNaira: number;
  currency: string;
  status: string;
  occurredAt: string;
  requestReference: string;
  requestSummary: string;
}

type TransactionState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; transactions: Transaction[] };

function formatMoney(naira: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(naira);
}

// The customer's transaction history: charges and refunds across their orders.
// Money for display only — the values are computed and serialized server-side.
export function TransactionHistory() {
  const [state, setState] = useState<TransactionState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    apiFetch<{ transactions: Transaction[] }>("/api/account/transactions")
      .then((json) => setState({ kind: "ready", transactions: json.transactions }))
      .catch((err) =>
        setState({
          kind: "error",
          message:
            err instanceof ApiError && err.message
              ? err.message
              : "We could not load your transactions.",
        }),
      );
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <section
      aria-label="Transaction history"
      className="flex flex-col gap-3 rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <header>
        <h2 className="text-lg font-semibold tracking-tight">
          Transaction history
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Your charges and refunds across every request.
        </p>
      </header>

      {state.kind === "loading" && (
        <p className="animate-pulse text-sm text-zinc-500 dark:text-zinc-400">
          Loading your transactions…
        </p>
      )}

      {state.kind === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
          <button
            type="button"
            onClick={load}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      )}

      {state.kind === "ready" &&
        (state.transactions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No transactions yet. When you pay for a request, the charge will
            show up here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5 rounded-xl border border-black/5 dark:divide-white/5 dark:border-white/5">
            {state.transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{tx.requestSummary}</span>
                  <span className="text-xs text-zinc-400">
                    {tx.type === "CHARGE"
                      ? "Payment"
                      : tx.type === "REFUND"
                        ? "Refund"
                        : "Earning"}{" "}
                    · {tx.reference} ·{" "}
                    {new Date(tx.occurredAt).toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <span
                  className={`whitespace-nowrap font-semibold ${
                    tx.type === "REFUND"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : ""
                  }`}
                >
                  {tx.type === "REFUND" ? "+" : tx.type === "CHARGE" ? "−" : ""}
                  {formatMoney(tx.amountNaira)}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}