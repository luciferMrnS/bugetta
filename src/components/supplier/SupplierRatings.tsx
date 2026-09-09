"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface SupplierRating {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  customerName: string;
  requestReference: string;
  requestSummary: string;
}

interface RatingsData {
  summary: { count: number; average: number | null; distribution: Array<{ score: number; count: number }> };
  reliability: {
    score: number;
    band: string;
    components: {
      ratingAverage: number | null;
      ratingCount: number;
      onTimeRatio: number | null;
      fulfilledOrders: number;
      complaintPenalty: number;
      disputePenalty: number;
      fraudPenalty: number;
    };
  };
  ratings: SupplierRating[];
}

function stars(score: number): string {
  return "★".repeat(score).padEnd(5, "☆");
}

type RatingsState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: RatingsData };

// Supplier trust block on the supplier dashboard: reliability score + the
// customer ratings that feed it. Read-only view of /api/suppliers/ratings.
export function SupplierRatings() {
  const [state, setState] = useState<RatingsState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    apiFetch<RatingsData>("/api/suppliers/ratings")
      .then((json) => setState({ kind: "ready", data: json }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setState({ kind: "empty" });
        } else {
          setState({
            kind: "error",
            message:
              err instanceof ApiError && err.message
                ? err.message
                : "We could not load your rating and trust information.",
          });
        }
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state.kind === "loading") {
    return (
      <section aria-label="Ratings and trust" className="mt-4 flex flex-col gap-3">
        <header>
          <h2 className="text-lg font-semibold">Your rating &amp; trust</h2>
          <p className="animate-pulse text-sm text-zinc-600 dark:text-zinc-400">
            Loading your trust information…
          </p>
        </header>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        aria-label="Ratings and trust"
        className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 dark:border-red-400/30 dark:bg-red-400/5"
      >
        <header>
          <h2 className="text-lg font-semibold">Your rating &amp; trust</h2>
        </header>
        <p className="text-sm text-red-700 dark:text-red-300">{state.message}</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Try again
        </button>
      </section>
    );
  }

  if (state.kind === "empty") {
    return (
      <section
        aria-label="Ratings and trust"
        className="mt-4 rounded-2xl border border-black/10 p-6 dark:border-white/10"
      >
        <h2 className="text-lg font-semibold">Your rating &amp; trust</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          We do not have rating or trust information for you yet. It appears
          once customers start rating your requests.
        </p>
      </section>
    );
  }

  const { data } = state;
  const { reliability } = data;

  return (
    <section
      aria-label="Ratings and trust"
      className="mt-4 flex flex-col gap-3"
    >
      <header>
        <h2 className="text-lg font-semibold">Your rating &amp; trust</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your reliability score is derived from customer ratings, on-time
          fulfilment and dispute history.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/10 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Reliability
          </p>
          <p className="mt-1 text-2xl font-semibold">{reliability.score}/100</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {reliability.band.toLowerCase()}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Average rating
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {reliability.components.ratingAverage ??
              "—"}{" "}
            <span className="text-amber-500 text-base">
              {reliability.components.ratingAverage
                ? stars(Math.round(reliability.components.ratingAverage))
                : ""}
            </span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {data.summary.count} rating{data.summary.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            On-time fulfilment
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {reliability.components.onTimeRatio === null
              ? "—"
              : `${reliability.components.onTimeRatio}%`}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {reliability.components.fulfilledOrders} fulfilled order
            {reliability.components.fulfilledOrders === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {data.ratings.length > 0 && (
        <ul className="flex flex-col divide-y divide-black/5 rounded-2xl border border-black/10 dark:divide-white/5 dark:border-white/10">
          {data.ratings.map((rating) => (
            <li
              key={rating.id}
              className="flex flex-col gap-1 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-amber-500 text-sm">{stars(rating.score)}</span>
                <span className="text-xs text-zinc-400">
                  {new Date(rating.createdAt).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {rating.comment && (
                <p className="text-sm leading-6">{rating.comment}</p>
              )}
              <p className="text-xs text-zinc-400">
                {rating.customerName} · {rating.requestSummary} ({rating.requestReference})
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}