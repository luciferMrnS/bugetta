"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
    hasError
      ? "border-red-500 focus:ring-red-500/30"
      : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
  }`;

function linesToValues(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function OptionForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [productName, setProductName] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [availability, setAvailability] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [images, setImages] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-full border border-foreground/80 px-6 py-3 text-sm font-semibold transition-colors hover:bg-foreground/5"
      >
        Add an option
      </button>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});

    try {
      await apiFetch(`/api/operations/requests/${requestId}/options`, {
        method: "POST",
        body: {
          supplier,
          productName,
          priceNaira: priceNaira === "" ? null : Number(priceNaira),
          availability: availability || undefined,
          estimatedDelivery: estimatedDelivery || undefined,
          notes: notes || undefined,
          terms: terms || undefined,
          images: linesToValues(images),
        },
      });
      setOpen(false);
      setSupplier("");
      setProductName("");
      setPriceNaira("");
      setAvailability("");
      setEstimatedDelivery("");
      setNotes("");
      setTerms("");
      setImages("");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const fe = err.fieldErrors ?? {};
        const mapped: Record<string, string> = {};
        for (const [field, messages] of Object.entries(fe)) {
          if (messages.length > 0) mapped[field] = messages[0];
        }
        setErrors(mapped);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  const field = (name: string, message: string | undefined) =>
    message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-4 dark:border-white/10"
      noValidate
    >
      <h3 className="text-sm font-semibold">Add an option</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplier" className="mb-1 block text-sm font-medium">
            Supplier
          </label>
          <input
            id="supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className={inputClass(Boolean(errors.supplier))}
            placeholder="e.g. Mama Put Restaurant"
          />
          {field("supplier", errors.supplier)}
        </div>
        <div>
          <label
            htmlFor="option-product"
            className="mb-1 block text-sm font-medium"
          >
            Product / service
          </label>
          <input
            id="option-product"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className={inputClass(Boolean(errors.productName))}
            placeholder="e.g. Jollof rice with chicken (party pack)"
          />
          {field("productName", errors.productName)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="option-price"
            className="mb-1 block text-sm font-medium"
          >
            Price{" "}
            <span className="font-normal text-zinc-400">(₦, optional)</span>
          </label>
          <input
            id="option-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className={inputClass(Boolean(errors.priceNaira))}
            placeholder="62000"
          />
          {field("priceNaira", errors.priceNaira)}
        </div>
        <div>
          <label
            htmlFor="option-availability"
            className="mb-1 block text-sm font-medium"
          >
            Availability{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="option-availability"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            className={inputClass(Boolean(errors.availability))}
            placeholder="e.g. in stock, 7–10 days to source"
          />
          {field("availability", errors.availability)}
        </div>
      </div>

      <div>
        <label
          htmlFor="option-delivery"
          className="mb-1 block text-sm font-medium"
        >
          Estimated delivery{" "}
          <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input
          id="option-delivery"
          value={estimatedDelivery}
          onChange={(e) => setEstimatedDelivery(e.target.value)}
          className={inputClass(Boolean(errors.estimatedDelivery))}
          placeholder="e.g. 3–5 days"
        />
        {field("estimatedDelivery", errors.estimatedDelivery)}
      </div>

      <div>
        <label htmlFor="option-notes" className="mb-1 block text-sm font-medium">
          Internal notes <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="option-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputClass(Boolean(errors.notes))} min-h-20 resize-y`}
          placeholder="Never shown to the customer."
        />
        {field("notes", errors.notes)}
      </div>

      <div>
        <label htmlFor="option-terms" className="mb-1 block text-sm font-medium">
          Terms <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="option-terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          className={`${inputClass(Boolean(errors.terms))} min-h-20 resize-y`}
          placeholder="Payment terms, cancellation rules…"
        />
        {field("terms", errors.terms)}
      </div>

      <div>
        <label htmlFor="option-images" className="mb-1 block text-sm font-medium">
          Image links{" "}
          <span className="font-normal text-zinc-400">
            (optional, one per line, up to 5)
          </span>
        </label>
        <textarea
          id="option-images"
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${inputClass(Boolean(errors.images))} min-h-16 resize-y`}
          placeholder="https://example.com/photo.jpg"
        />
        {field("images", errors.images)}
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save option"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-5 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}