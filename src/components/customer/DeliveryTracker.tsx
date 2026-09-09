"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface DeliveryEvent {
  id: string;
  toStatusLabel: string;
  createdAt: string;
}

interface DeliveryTrackerData {
  reference: string;
  providerLabel: string;
  status: string;
  statusLabel: string;
  dropLocation: string | null;
  eta: string | null;
  trackingUrl: string | null;
  recipientName: string | null;
  deliveredAt: string | null;
  proofType: string | null;
  events: DeliveryEvent[];
  updatedAt: string;
}

type DeliveryState =
  | { kind: "loading" }
  | { kind: "not-started" }
  | { kind: "error"; message: string }
  | { kind: "ready"; delivery: DeliveryTrackerData };

// Customer-facing delivery tracker. Read-only; it surfaces progress, ETA,
// tracking link and proof — never fees or internal courier details.
export function DeliveryTracker({ requestId }: { requestId: string }) {
  const [state, setState] = useState<DeliveryState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    apiFetch<{ delivery: DeliveryTrackerData }>(
      `/api/requests/${requestId}/delivery`,
    )
      .then((data) => {
        if (data.delivery === null) {
          // The owning request exists but delivery has not started yet —
          // the same graceful empty state as a 404 means "no delivery".
          setState({ kind: "not-started" });
        } else {
          setState({ kind: "ready", delivery: data.delivery });
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "not-started" });
        } else {
          setState({
            kind: "error",
            message:
              err instanceof ApiError && err.message
                ? err.message
                : "We could not load your delivery updates.",
          });
        }
      });
  }, [requestId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state.kind === "loading") {
    return (
      <section
        aria-label="Delivery tracking"
        className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <p className="mt-1 animate-pulse text-sm text-zinc-500 dark:text-zinc-400">
          Checking delivery status…
        </p>
      </section>
    );
  }

  if (state.kind === "not-started") {
    return (
      <section
        aria-label="Delivery tracking"
        className="rounded-2xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          We have not started delivery for this request yet.
        </p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        aria-label="Delivery tracking"
        className="flex flex-col gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 dark:border-red-400/30 dark:bg-red-400/5"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <p className="text-sm text-red-700 dark:text-red-300">
          {state.message}
        </p>
        <button
          type="button"
          onClick={load}
          className="w-fit rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Try again
        </button>
      </section>
    );
  }

  const { delivery } = state;

  return (
    <section
      aria-label="Delivery tracking"
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Delivery</h2>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {delivery.statusLabel}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Courier</dt>
          <dd className="font-medium">{delivery.providerLabel}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Expected by</dt>
          <dd className="font-medium">
            {delivery.eta
              ? new Date(delivery.eta).toLocaleString("en-NG", {
                  day: "numeric",
                  month: "long",
                })
              : "Being confirmed"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Delivery to</dt>
          <dd className="font-medium">{delivery.dropLocation ?? "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Reference</dt>
          <dd className="font-medium">{delivery.reference}</dd>
        </div>
      </dl>

      {delivery.trackingUrl && (
        <p className="text-sm">
          <a
            href={delivery.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Track with the courier
          </a>
        </p>
      )}

      {delivery.status === "DELIVERED" && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm dark:border-emerald-400/30 dark:bg-emerald-400/5">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
            Delivered
            {delivery.deliveredAt
              ? ` on ${new Date(delivery.deliveredAt).toLocaleString("en-NG")}`
              : ""}
          </p>
          {delivery.recipientName && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-300">
              Received by {delivery.recipientName}
            </p>
          )}
          {delivery.proofType && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Proof recorded ({delivery.proofType})
            </p>
          )}
        </div>
      )}

      {delivery.events.length > 0 && (
        <ol className="flex flex-col divide-y divide-black/5 border-t border-black/5 dark:divide-white/5 dark:border-white/5">
          {delivery.events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="font-medium">{event.toStatusLabel}</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
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
  );
}