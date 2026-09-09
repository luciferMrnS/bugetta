"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { SupplierProfileOutput } from "@/lib/suppliers/serialize";

type ReviewAction = "approve" | "reject" | "suspend";

export default function ReviewSupplier({
  supplier,
  onReviewed,
}: {
  supplier: SupplierProfileOutput;
  onReviewed: (action: ReviewAction) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: ReviewAction) {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/suppliers/${supplier.id}`, {
        method: "POST",
        body: { action },
      });
      onReviewed(action);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">{supplier.businessName}</span>
          <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
            {supplier.statusLabel}
          </span>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Contact: {supplier.contactName || "—"}
          {supplier.phone ? ` · ${supplier.phone}` : ""}
          {supplier.whatsapp ? ` · WhatsApp ${supplier.whatsapp}` : ""}
        </span>
      </div>

      {supplier.description && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {supplier.description}
        </p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{supplier.categoryLabels.length > 0 ? supplier.categoryLabels.join(", ") : "No categories"}</span>
        {supplier.serviceArea && (
          <>
            <span aria-hidden="true">·</span>
            <span>{supplier.serviceArea}</span>
          </>
        )}
        {supplier.operatingHours && (
          <>
            <span aria-hidden="true">·</span>
            <span>{supplier.operatingHours}</span>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => act("approve")}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act("reject")}
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Reject
        </button>
        {supplier.status !== "SUSPENDED" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => act("suspend")}
            className="rounded-full border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/5 dark:text-red-400"
          >
            Suspend
          </button>
        )}
      </div>
    </li>
  );
}