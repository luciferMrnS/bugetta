"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface AutomationRunView {
  id: string;
  reference: string;
  trigger: string;
  requestReference: string | null;
  status: string;
  summary: string | null;
  results: Array<{ action: string; detail: string }>;
  error: string | null;
  createdAt: string;
}

type Payload = {
  runs: AutomationRunView[];
  triggers: string[];
  totals: { completed: number; skipped: number; failed: number };
};

type LedgerState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: Payload };

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  SKIPPED: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AutomationLedger() {
  const [state, setState] = useState<LedgerState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    apiFetch<Payload>("/api/operations/automation/runs")
      .then((data) => setState({ kind: "ready", data }))
      .catch((err) =>
        setState({
          kind: "error",
          message:
            err instanceof ApiError && err.message
              ? err.message
              : "We could not load the automation ledger.",
        }),
      );
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state.kind === "loading") {
    return (
      <p className="animate-pulse text-sm text-zinc-400">
        Loading automation ledger…
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 dark:border-red-400/30 dark:bg-red-400/5">
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
    );
  }

  const { data } = state;

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Run totals"
        className="grid grid-cols-3 gap-3"
      >
        {(
          [
            ["Completed", data.totals.completed, "text-emerald-600 dark:text-emerald-400"],
            ["Skipped", data.totals.skipped, "text-zinc-500"],
            ["Failed", data.totals.failed, "text-red-600 dark:text-red-400"],
          ] as const
        ).map(([label, count, color]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-2xl border border-black/10 p-4 dark:border-white/10"
          >
            <span className={`text-2xl font-semibold ${color}`}>{count}</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
          </div>
        ))}
      </section>

      {data.runs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-zinc-400 dark:border-white/10">
          No automation runs recorded yet. Creating, paying and delivering a
          request will populate this ledger.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {data.runs.map((run) => (
            <li
              key={run.id}
              className="rounded-2xl border border-black/10 p-4 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-black/5 px-2.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                    {run.reference}
                  </span>
                  <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold dark:bg-white/10">
                    {run.trigger}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[run.status] ?? STATUS_STYLE.SKIPPED}`}
                  >
                    {run.status}
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">
                  {formatTime(run.createdAt)}
                </span>
              </div>

              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {run.summary}
              </p>
              {run.requestReference && (
                <p className="mt-0.5 text-xs text-zinc-400">
                  Request {run.requestReference}
                </p>
              )}

              {(run.results.length > 0 || run.error) && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-3 dark:border-white/5">
                  {run.results.map((result, index) => (
                    <li key={`${run.id}-${index}`} className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-mono">{result.action}</span>
                      <span>{result.detail}</span>
                    </li>
                  ))}
                  {run.error && (
                    <li className="text-xs text-red-600">
                      <span className="font-mono">error</span> {run.error}
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}