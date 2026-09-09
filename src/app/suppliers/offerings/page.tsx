"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type {
  SupplierOfferingOutput,
  SupplierProfileOutput,
} from "@/lib/suppliers/serialize";
import { formatNaira } from "@/lib/money";
import { CATEGORY_GROUPS, CATEGORY_LABELS } from "@/lib/requests/categories";
import { CatalogSyncPanel } from "@/components/suppliers/CatalogSyncPanel";

interface OfferingForm {
  category: string;
  title: string;
  description: string;
  priceNaira: string;
  availability: string;
  location: string;
  deliveryDetail: string;
  quantityAvailable: string;
}

const EMPTY_FORM: OfferingForm = {
  category: "",
  title: "",
  description: "",
  priceNaira: "",
  availability: "",
  location: "",
  deliveryDetail: "",
  quantityAvailable: "",
};

export default function SupplierOfferingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SupplierProfileOutput | null>(null);
  const [offerings, setOfferings] = useState<SupplierOfferingOutput[]>([]);
  const [form, setForm] = useState<OfferingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notApproved, setNotApproved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [profileData, offeringData] = await Promise.all([
          apiFetch<{ supplier: SupplierProfileOutput }>("/api/suppliers/profile"),
          apiFetch<{ offerings: SupplierOfferingOutput[] }>("/api/suppliers/offerings"),
        ]);
        setProfile(profileData.supplier);
        setOfferings(offeringData.offerings);
      } catch (err) {
        if (err instanceof ApiError && err.code === "NOT_APPROVED") {
          setNotApproved(true);
        } else if (err instanceof ApiError && err.code === "FORBIDDEN") {
          router.replace("/");
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, [router]);

  async function setStock(offering: SupplierOfferingOutput, quantity: string) {
    const trimmed = quantity.trim();
    if (trimmed !== "" && !/^\d+$/.test(trimmed)) {
      setFormError("Stock quantity must be zero or a positive whole number.");
      return;
    }
    const parsed = trimmed === "" ? null : Number(trimmed);
    try {
      const data = await apiFetch<{ offering: SupplierOfferingOutput }>(
        `/api/suppliers/offerings/${offering.id}`,
        {
          method: "PUT",
          body: { quantityAvailable: parsed },
        },
      );
      setOfferings((prev) =>
        prev.map((o) => (o.id === data.offering.id ? data.offering : o)),
      );
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not update stock.",
      );
    }
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      const priceNaira =
        form.priceNaira.trim() === "" ? undefined : Number(form.priceNaira);
      const data = await apiFetch<{ offering: SupplierOfferingOutput }>(
        "/api/suppliers/offerings",
        {
          method: "POST",
          body: {
            category: form.category,
            title: form.title,
            description: form.description,
            priceNaira,
            availability: form.availability,
            location: form.location,
            deliveryDetail: form.deliveryDetail,
            images: [],
            isActive: true,
            quantityAvailable:
              form.quantityAvailable.trim() === ""
                ? undefined
                : Number(form.quantityAvailable),
          },
        },
      );
      setOfferings((prev) => [data.offering, ...prev]);
      setForm(EMPTY_FORM);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  async function toggleActive(offering: SupplierOfferingOutput) {
    try {
      const data = await apiFetch<{ offering: SupplierOfferingOutput }>(
        `/api/suppliers/offerings/${offering.id}`,
        {
          method: "PUT",
          body: { isActive: !offering.isActive },
        },
      );
      setOfferings((prev) =>
        prev.map((o) => (o.id === data.offering.id ? data.offering : o)),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    }
  }

  async function remove(offering: SupplierOfferingOutput) {
    try {
      await apiFetch(`/api/suppliers/offerings/${offering.id}`, {
        method: "DELETE",
      });
      setOfferings((prev) => prev.filter((o) => o.id !== offering.id));
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    }
  }

  if (!loaded) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
        <p className="text-sm text-zinc-500">Loading…</p>
      </main>
    );
  }

  if (notApproved || (profile && profile.status !== "APPROVED")) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Offerings</h1>
          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-5 py-4">
            <p className="text-sm font-medium">
              Your supplier account is awaiting review.
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              You&apos;ll manage your catalogue once it&apos;s approved.
            </p>
            <Link
              href="/suppliers"
              className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Back to dashboard
            </Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Offerings</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              What you sell and deliver. Everything here is optional — you can
              add one item or fifty.
            </p>
          </div>
          <Link
            href="/suppliers"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Dashboard
          </Link>
        </div>

        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 rounded-2xl border border-black/10 p-5 dark:border-white/10"
        >
          <h2 className="text-sm font-semibold">Add an offering</h2>
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
            >
              <option value="">Select a category…</option>
              {CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABELS[key]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              placeholder="Jollof rice with chicken & fried plantain"
            />
          </div>
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">
              Description{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              placeholder="Freshly cooked to order, party packs available…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className="mb-1 block text-sm font-medium">
                Price (₦){" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="price"
                type="number"
                min="0"
                step="any"
                value={form.priceNaira}
                onChange={(e) => setForm({ ...form, priceNaira: e.target.value })}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Leave blank to price on request"
              />
            </div>
            <div>
              <label htmlFor="availability" className="mb-1 block text-sm font-medium">
                Availability{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="availability"
                type="text"
                value={form.availability}
                onChange={(e) => setForm({ ...form, availability: e.target.value })}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Made to order · 24h notice"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="location" className="mb-1 block text-sm font-medium">
                Location{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Ikeja, Lagos"
              />
            </div>
            <div>
              <label htmlFor="delivery" className="mb-1 block text-sm font-medium">
                Delivery detail{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="delivery"
                type="text"
                value={form.deliveryDetail}
                onChange={(e) => setForm({ ...form, deliveryDetail: e.target.value })}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Delivered, or pickup in store"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="quantity" className="mb-1 block text-sm font-medium">
                Stock quantity{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="quantity"
                type="number"
                min="0"
                step="1"
                value={form.quantityAvailable}
                onChange={(e) => setForm({ ...form, quantityAvailable: e.target.value })}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Leave blank to not track stock"
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                When a tracked item drops low, we alert you automatically.
              </p>
            </div>
          </div>
          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
            >
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !form.category || form.title.trim() === ""}
            className="mt-1 w-full rounded-full bg-foreground px-6 py-3 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Adding…" : "Add offering"}
          </button>
        </form>

        {offerings.length === 0 ? (
          <section
            aria-label="No offerings yet"
            className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/15"
          >
            <p className="font-medium">No offerings yet</p>
            <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
              Add your first offering above so we can match you with the right
              requests.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {offerings.map((offering) => (
              <li
                key={offering.id}
                className="flex flex-col gap-4 rounded-2xl border border-black/10 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 dark:border-white/10"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{offering.title}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        offering.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                      }`}
                    >
                      {offering.isActive ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {offering.categoryLabel}
                  </span>
                  {offering.description && (
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {offering.description}
                    </span>
                  )}
                  <span className="text-sm font-medium">
                    {offering.priceNaira === null
                      ? "Price on request"
                      : formatNaira(offering.priceNaira * 100)}
                  </span>
                  {offering.quantityAvailable !== null && (
                    <span
                      className={`text-xs font-medium ${
                        offering.quantityAvailable <= 5
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {offering.quantityAvailable === 0
                        ? "Out of stock"
                        : `${offering.quantityAvailable} in stock`}
                      {offering.quantityAvailable <= 5 && offering.quantityAvailable > 0
                        ? " · low"
                        : ""}
                    </span>
                  )}
                  {(offering.availability ||
                    offering.location ||
                    offering.deliveryDetail) && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {[offering.availability, offering.location, offering.deliveryDetail]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`stock-${offering.id}`}
                      className="text-[10px] font-medium uppercase tracking-wide text-zinc-400"
                    >
                      Stock
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`stock-${offering.id}`}
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={
                          offering.quantityAvailable === null
                            ? ""
                            : offering.quantityAvailable
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setStock(offering, (e.target as HTMLInputElement).value);
                          }
                        }}
                        onBlur={(e) => setStock(offering, e.target.value)}
                        className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-foreground dark:border-white/15"
                        placeholder="—"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleActive(offering)}
                    className="rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    {offering.isActive ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(offering)}
                    className="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/5 dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <CatalogSyncPanel
          offerings={offerings.map((o) => ({ id: o.id, title: o.title }))}
        />
      </div>
    </main>
  );
}