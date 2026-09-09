"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiClient";
import { requestStatusLabel } from "@/lib/requests/status";

export function StatusChanger({
  requestId,
  current,
  allowed,
}: {
  requestId: string;
  current: string;
  allowed: string[];
}) {
  const router = useRouter();
  const [next, setNext] = useState(allowed[0] ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!next) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/operations/requests/${requestId}/status`, {
        method: "POST",
        body: { status: next },
      });
      router.refresh();
    } catch {
      setError("Could not update the status. Please try again.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="next-status" className="mb-1 block text-sm font-medium">
          Move to
        </label>
        {allowed.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {current === "COMPLETED"
              ? "This request is completed."
              : "This request is cancelled."}
          </p>
        ) : (
          <select
            id="next-status"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/15 dark:border-white/15"
          >
            {allowed.map((status) => (
              <option key={status} value={status}>
                {requestStatusLabel(status)}
              </option>
            ))}
          </select>
        )}
      </div>

      {allowed.length > 0 && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update status"}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}