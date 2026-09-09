"use client";

import { useState } from "react";

interface CheckoutSectionProps {
  requestId: string;
  amountNaira: number;
  productName: string;
}

function formatMoney(naira: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(naira);
}

type Status = "idle" | "initiating" | "redirecting";

export function CheckoutSection({
  requestId,
  amountNaira,
  productName,
}: CheckoutSectionProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function payNow() {
    setError(null);
    setStatus("initiating");
    try {
      const res = await fetch(
        `/api/requests/${requestId}/payment/initialize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setStatus("idle");
        setError(body?.error?.message || "Something went wrong.");
        return;
      }
      // Redirect to the provider checkout with the capability token.
      const paymentUrl = body?.data?.paymentUrl as string | undefined;
      if (paymentUrl) {
        window.location.assign(paymentUrl);
      }
      setStatus("redirecting");
    } catch {
      setStatus("idle");
      setError("Something went wrong starting payment.");
    }
  }
  return (
    <section
      aria-label="Payment"
      className="flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 dark:border-violet-400/30 dark:bg-violet-400/5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Complete your payment
        </h2>
        <span className="text-lg font-bold">{formatMoney(amountNaira)}</span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {productName}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        You will be taken to a secure checkout to authorise the payment. Your
        order is confirmed the moment the payment is received — you don&apos;t
        need to tell us.
      </p>
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="pt-1">
        <button
          type="button"
          disabled={status !== "idle"}
          onClick={payNow}
          className="inline-flex h-9 items-center rounded-lg bg-violet-600 px-5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {status === "initiating"
            ? "Starting…"
            : status === "redirecting"
              ? "Redirecting…"
              : "Pay now"}
        </button>
      </div>
    </section>
  );
}

export function PaymentReceived({
  amountNaira,
  productName,
}: {
  amountNaira: number;
  productName: string;
}) {
  return (
    <section
      aria-label="Payment received"
      className="flex flex-col gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 dark:border-emerald-400/30 dark:bg-emerald-400/5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Payment received
        </h2>
        <span className="text-lg font-bold">{formatMoney(amountNaira)}</span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{productName}</p>
    </section>
  );
}