"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface NotificationView {
  id: string;
  kind: string;
  reference: string | null;
  title: string;
  body: string;
  channels: string[];
  readAt: string | null;
  createdAt: string;
}

type Payload = { notifications: NotificationView[]; unreadCount: number };

type FeedState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: NotificationView[] };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationsList() {
  const router = useRouter();
  const [state, setState] = useState<FeedState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    apiFetch<Payload>("/api/account/notifications")
      .then((data) => setState({ kind: "ready", items: data.notifications }))
      .catch((err) =>
        setState({
          kind: "error",
          message:
            err instanceof ApiError && err.message
              ? err.message
              : "We could not load your notifications.",
        }),
      );
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function openNotification(item: NotificationView) {
    if (!item.readAt) {
      try {
        await apiFetch<{ updated: boolean }>(
          `/api/account/notifications/${item.id}`,
          { method: "POST" },
        );
      } catch {
        // Reading is best-effort; the feed stays usable if the request fails.
      }
    }
    router.push("/notifications");
  }

  if (state.kind === "loading") {
    return (
      <p className="animate-pulse text-sm text-zinc-400">
        Loading your notifications…
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

  const { items } = state;

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No notifications yet. When something happens on your requests — quotes,
        payments, delivery — it lands here.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className={`rounded-2xl border border-black/10 p-4 dark:border-white/10 ${item.readAt ? "" : "bg-black/[0.02] dark:bg-white/[0.04]"}`}
        >
          <button
            type="button"
            onClick={() => openNotification(item)}
            className="flex w-full flex-col gap-1 text-left"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {!item.readAt && (
                  <span
                    className="h-2 w-2 rounded-full bg-red-600"
                    aria-hidden="true"
                  />
                )}
                {item.title}
              </span>
              <span className="shrink-0 text-[11px] text-zinc-400">
                {formatTime(item.createdAt)}
              </span>
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {item.body}
            </span>
            {item.channels.length > 0 && (
              <span className="text-[11px] text-zinc-400">
                via {item.channels.join(", ")}
              </span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}