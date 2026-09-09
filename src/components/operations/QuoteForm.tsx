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

export interface QuotePrefill {
  optionId: string;
  productName: string;
  priceNaira: number | null;
}

export function QuoteForm({
  requestId,
  prefill,
}: {
  requestId: string;
  prefill?: QuotePrefill;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState(prefill?.productName ?? "");
  const [priceNaira, setPriceNaira] = useState(
    prefill?.priceNaira === null || prefill?.priceNaira === undefined
      ? ""
      : String(prefill.priceNaira),
  );
  const [serviceFeeNaira, setServiceFeeNaira] = useState("0");
  const [deliveryFeeNaira, setDeliveryFeeNaira] = useState("0");
  const [information, setInformation] = useState("");
  const [images, setImages] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={prefill?.priceNaira === null || prefill?.priceNaira === undefined}
        className="rounded-full border border-foreground/80 px-4 py-2 text-xs font-semibold transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
        title={
          prefill && prefill.priceNaira === null
            ? "Price this option first"
            : "Quote this option to the customer"
        }
      >
        Quote to customer
      </button>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});

    try {
      const imageLines = images
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      await apiFetch(`/api/operations/requests/${requestId}/quotes`, {
        method: "POST",
        body: {
          optionId: prefill?.optionId,
          productName,
          priceNaira: Number(priceNaira),
          serviceFeeNaira: serviceFeeNaira !== "" ? Number(serviceFeeNaira) : 0,
          deliveryFeeNaira: deliveryFeeNaira !== "" ? Number(deliveryFeeNaira) : 0,
          information: information || undefined,
          images: imageLines.length > 0 ? imageLines : undefined,
          estimatedDelivery: estimatedDelivery || undefined,
          validUntil: validUntil || undefined,
          terms: terms || undefined,
        },
      });
      setOpen(false);
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
      className="mt-3 flex flex-col gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]"
      noValidate
    >
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Quote to customer
      </h4>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="quote-product"
            className="mb-1 block text-sm font-medium"
          >
            Product / service
          </label>
          <input
            id="quote-product"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className={inputClass(Boolean(errors.productName))}
          />
          {field("productName", errors.productName)}
        </div>
        <div>
          <label
            htmlFor="quote-price"
            className="mb-1 block text-sm font-medium"
          >
            Final price (₦)
          </label>
          <input
            id="quote-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className={inputClass(Boolean(errors.priceNaira))}
          />
          {field("priceNaira", errors.priceNaira)}
        </div>
        <div>
          <label
            htmlFor="quote-service-fee"
            className="mb-1 block text-sm font-medium"
          >
            Service fee (₦){" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="quote-service-fee"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={serviceFeeNaira}
            onChange={(e) => setServiceFeeNaira(e.target.value)}
            className={inputClass(Boolean(errors.serviceFeeNaira))}
          />
          {field("serviceFeeNaira", errors.serviceFeeNaira)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="quote-delivery"
            className="mb-1 block text-sm font-medium"
          >
            Estimated delivery{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="quote-delivery"
            value={estimatedDelivery}
            onChange={(e) => setEstimatedDelivery(e.target.value)}
            className={inputClass(Boolean(errors.estimatedDelivery))}
            placeholder="3–5 days"
          />
          {field("estimatedDelivery", errors.estimatedDelivery)}
        </div>
        <div>
          <label
            htmlFor="quote-delivery-fee"
            className="mb-1 block text-sm font-medium"
          >
            Delivery fee (₦){" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="quote-delivery-fee"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={deliveryFeeNaira}
            onChange={(e) => setDeliveryFeeNaira(e.target.value)}
            className={inputClass(Boolean(errors.deliveryFeeNaira))}
          />
          {field("deliveryFeeNaira", errors.deliveryFeeNaira)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="quote-valid"
            className="mb-1 block text-sm font-medium"
          >
            Offer valid until{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="quote-valid"
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className={inputClass(Boolean(errors.validUntil))}
          />
          {field("validUntil", errors.validUntil)}
        </div>
      </div>

      <div>
        <label
          htmlFor="quote-information"
          className="mb-1 block text-sm font-medium"
        >
          Relevant information{" "}
          <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="quote-information"
          value={information}
          onChange={(e) => setInformation(e.target.value)}
          className={`${inputClass(Boolean(errors.information))} min-h-16 resize-y`}
          placeholder="e.g. This is in stock and can be delivered tomorrow."
        />
        {field("information", errors.information)}
      </div>

      <div>
        <label htmlFor="quote-images" className="mb-1 block text-sm font-medium">
          Image links{" "}
          <span className="font-normal text-zinc-400">
            (optional, one per line, up to 5)
          </span>
        </label>
        <textarea
          id="quote-images"
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${inputClass(Boolean(errors.images))} min-h-16 resize-y`}
          placeholder="https://example.com/photo.jpg"
        />
        {field("images", errors.images)}
      </div>

      <div>
        <label htmlFor="quote-terms" className="mb-1 block text-sm font-medium">
          Terms{" "}
          <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="quote-terms"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          className={`${inputClass(Boolean(errors.terms))} min-h-16 resize-y`}
          placeholder="Valid for 72 hours. Delivery to Lagos Island. Cash on delivery supported."
        />
        {field("terms", errors.terms)}
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-600"
        >
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send quote"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-4 py-2.5 text-sm text-zinc-600 transition-colors hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}