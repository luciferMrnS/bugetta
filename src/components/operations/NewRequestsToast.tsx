"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client/apiClient";
import type { OperationRequestCard } from "@/lib/operations/serialize";

interface ToastState {
  id: string;
  reference: string;
  summary: string;
  customerName: string;
}

const POLL_INTERVAL_MS = 8000;
const TOAST_TTL_MS = 12000;

export function NewRequestsToast() {
  const lastSeenAtRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      try {
        const since = lastSeenAtRef.current;
        const query =
          since === null ? "" : `?since=${encodeURIComponent(since)}`;
        const data = await apiFetch<{ requests: OperationRequestCard[] }>(
          `/api/operations/requests${query}`,
        );
        if (cancelled) return;

        const requests = data.requests ?? [];
        if (requests.length === 0) return;

        // The first poll has no baseline, so it just records the current
        // newest request and stays quiet — otherwise every page load would
        // bombard ops with stale alerts for requests already on the board.
        if (lastSeenAtRef.current === null) {
          lastSeenAtRef.current = requests[0].createdAt;
          for (const request of requests) {
            seenIdsRef.current.add(request.id);
          }
          return;
        }

        const fresh = requests.filter(
          (request) => !seenIdsRef.current.has(request.id),
        );
        if (fresh.length === 0) return;

        lastSeenAtRef.current = requests[0].createdAt;
        for (const request of requests) {
          seenIdsRef.current.add(request.id);
        }
        const incoming = fresh.map((request) => ({
          id: request.id,
          reference: request.reference,
          summary: request.summary,
          customerName: request.customerName,
        }));
        setToasts((prev) => [...prev, ...incoming].slice(-3));
      } catch {
        // A mid-sign-out 401 or network blip is expected; skip this round
        // and let the next tick try again.
      }
    }

    // Priming round establishes the baseline without alerting.
    const timer = setTimeout(() => {
      void poll();
      interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    }, 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, []);

  // Auto-dismiss each toast after a short time so the popup never lingers.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      setTimeout(() => dismiss(toast.id), TOAST_TTL_MS),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex flex-col gap-1.5 rounded-2xl border border-black/10 bg-surface p-3 shadow-lg dark:border-white/10"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-accent"
              />
              New request — {toast.reference}
            </span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-full px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              ✕
            </button>
          </div>
          <p className="line-clamp-2 text-sm font-medium">{toast.summary}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {toast.customerName}
          </p>
          <Link
            href={`/operations/requests/${toast.id}`}
            onClick={() => dismiss(toast.id)}
            className="mt-1 self-start rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            Open request →
          </Link>
        </div>
      ))}
    </div>
  );
}