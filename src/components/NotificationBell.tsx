"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client/apiClient";

interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

type Payload = { notifications: NotificationView[]; unreadCount: number };

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Payload>("/api/account/notifications");
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
      setFeedError(false);
    } catch (err) {
      // A mid-sign-out 401 is expected; other failures surface below.
      if (!(err instanceof ApiError && err.status === 401)) {
        setFeedError(true);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        load();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch<{ updated: number }>("/api/account/notifications", {
        method: "POST",
        body: { action: "read_all" },
      });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-black/5 dark:text-zinc-200 dark:hover:bg-white/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M9.3 20a2.7 2.7 0 0 0 5.4 0"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-2xl border border-black/10 bg-surface p-3 shadow-lg dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              onClick={markAllRead}
              disabled={busy || unreadCount === 0}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-black/5 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Mark all read
            </button>
          </div>

          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {feedError ? (
              <li className="flex flex-col items-center gap-2 px-2 py-6 text-center">
                <span className="text-xs text-red-700 dark:text-red-300">
                  We could not load your notifications.
                </span>
                <button
                  type="button"
                  onClick={load}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  Try again
                </button>
              </li>
            ) : (
              items.length === 0 && (
                <li className="px-2 py-6 text-center text-xs text-zinc-400">
                  Nothing yet — we&apos;ll let you know when there&apos;s news.
                </li>
              )
            )}
            {!feedError &&
              items.slice(0, 8).map((item) => (
              <li key={item.id}>
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className={`flex flex-col gap-0.5 rounded-xl px-2 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${item.readAt ? "" : "bg-black/[0.03] dark:bg-white/[0.04]"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium">
                    {item.title}
                    <span className="shrink-0 text-[10px] font-normal text-zinc-400">
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="rounded-full bg-foreground px-3 py-2 text-center text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}