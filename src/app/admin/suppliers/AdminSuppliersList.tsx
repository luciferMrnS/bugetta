"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { SupplierProfileOutput } from "@/lib/suppliers/serialize";
import ReviewSupplier from "./ReviewSupplier";

export default function AdminSuppliersList({
  initial,
}: {
  initial: SupplierProfileOutput[];
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRefreshing(true);
        const data = await apiFetch<{ suppliers: SupplierProfileOutput[] }>(
          "/api/admin/suppliers",
        );
        setSuppliers(data.suppliers);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          router.replace("/");
        } else if (err instanceof ApiError) {
          setError(err.message);
        }
      } finally {
        setRefreshing(false);
      }
    })();
  }, [router]);

  const pending = suppliers.filter((s) => s.status === "PENDING");
  const reviewed = suppliers.filter((s) => s.status !== "PENDING");

  function handleReviewed(id: string) {
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Supplier reviews
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Approve or reject supplier registrations. Only approved suppliers
          can receive and fulfill orders.
        </p>
      </div>

      {refreshing && (
        <p className="mt-4 animate-pulse text-sm text-zinc-500 dark:text-zinc-400">
          Refreshing the review queue…
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 flex flex-col items-start gap-3">
          <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Try again
          </button>
        </div>
      )}

      <section aria-label="Pending reviews" className="mt-8 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Awaiting review{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({pending.length})
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15">
            No pending applications.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((supplier) => (
              <ReviewSupplier
                key={supplier.id}
                supplier={supplier}
                onReviewed={() => handleReviewed(supplier.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section
          aria-label="Reviewed suppliers"
          className="mt-8 flex flex-col gap-3"
        >
          <h2 className="text-lg font-semibold">Reviewed</h2>
          <ul className="flex flex-col gap-3">
            {reviewed.map((supplier) => (
              <div
                key={supplier.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 p-4 dark:border-white/10"
              >
                <span className="font-medium">{supplier.businessName}</span>
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {supplier.statusLabel}
                </span>
              </div>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}