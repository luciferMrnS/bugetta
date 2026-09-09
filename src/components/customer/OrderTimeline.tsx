import type { RequestStatusEventView } from "@/lib/requests/events";
import {
  REQUEST_LIFECYCLE,
  TERMINAL_STATUSES,
  REQUEST_STATUS_LABELS,
  type RequestStatusKey,
} from "@/lib/requests/status";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Order timeline for the customer. Renders the happy-path lifecycle as a
// stepped progress view (driven by the immutable status event history — never
// inferred from the current status alone), then surfaces the terminal event if
// the order left the mainline (cancelled / refunded / disputed).
export function OrderTimeline({
  currentStatus,
  statusEvents,
}: {
  currentStatus: string;
  statusEvents: RequestStatusEventView[];
}) {
  const reachedAt = new Map<string, string>();
  for (const event of statusEvents) {
    if (!reachedAt.has(event.toStatus)) {
      reachedAt.set(event.toStatus, event.createdAt);
    }
  }

  let furthestStep = 0;
  for (let i = 0; i < REQUEST_LIFECYCLE.length; i++) {
    if (reachedAt.has(REQUEST_LIFECYCLE[i])) {
      furthestStep = i;
    }
  }

  const onMainline = REQUEST_LIFECYCLE.some((s) => s === currentStatus);
  const currentStep = onMainline
    ? reachedAt.has(currentStatus)
      ? REQUEST_LIFECYCLE.indexOf(currentStatus as RequestStatusKey)
      : furthestStep
    : furthestStep;

  const terminalEvent = statusEvents.find((event) =>
    TERMINAL_STATUSES.includes(event.toStatus as RequestStatusKey),
  );

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-0">
        {REQUEST_LIFECYCLE.map((status, index) => {
          const done = index < currentStep;
          const current = index === currentStep;
          const upcoming = index > currentStep;
          return (
            <li key={status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                      : current
                        ? "bg-indigo-500 text-white"
                        : "bg-black/5 text-zinc-400 dark:bg-white/10 dark:text-zinc-500"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                {index < REQUEST_LIFECYCLE.length - 1 && (
                  <span
                    className={`my-0.5 w-px flex-1 min-h-4 ${
                      upcoming
                        ? "bg-black/10 dark:bg-white/10"
                        : "bg-emerald-500/40"
                    }`}
                  />
                )}
              </div>
              <div className="pb-5">
                <p
                  className={`text-sm font-medium ${
                    upcoming
                      ? "text-zinc-400 dark:text-zinc-500"
                      : current
                        ? "text-zinc-900 dark:text-zinc-50"
                        : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {REQUEST_STATUS_LABELS[status]}
                </p>
                {!upcoming && reachedAt.has(status) && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatWhen(reachedAt.get(status)!)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {terminalEvent && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            terminalEvent.toStatus === "CANCELLED"
              ? "border-zinc-500/30 bg-zinc-500/5"
              : terminalEvent.toStatus === "REFUNDED"
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-red-500/30 bg-red-500/5"
          }`}
        >
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {REQUEST_STATUS_LABELS[terminalEvent.toStatus as RequestStatusKey]}
            {terminalEvent.cause === "refund" ? " — full refund issued" : ""}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {terminalEvent.causeLabel} · {formatWhen(terminalEvent.createdAt)}
          </p>
        </div>
      )}

      {statusEvents.length === 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          No status history recorded yet.
        </p>
      )}
    </div>
  );
}