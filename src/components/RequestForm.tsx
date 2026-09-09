"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { RequestOutput } from "@/lib/requests/serialize";

interface FieldErrors {
  description?: string;
  items?: string;
  budgetNaira?: string;
  quantity?: string;
  location?: string;
  deliveryDeadline?: string;
  instructions?: string;
  images?: string;
}

const inputClass = (hasError: boolean) =>
  `w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
    hasError
      ? "border-red-500 focus:ring-red-500/30"
      : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
  }`;

function linesToItems(text: string): Array<{ name: string }> {
  return text
    .split(/[\n,;]+/)
    .map((line) => line.replace(/^[\s*•·\-–—]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((name) => ({ name }));
}

function linesToValues(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface CreateRequestResponse {
  request: RequestOutput;
}

export function RequestForm() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [items, setItems] = useState("");
  const [budgetNaira, setBudgetNaira] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [instructions, setInstructions] = useState("");
  const [images, setImages] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});

    const payload = {
      description,
      items: linesToItems(items),
      quantity: quantity || undefined,
      location: location || undefined,
      deliveryDeadline: deliveryDeadline || undefined,
      instructions: instructions || undefined,
      budgetNaira: budgetNaira === "" ? undefined : Number(budgetNaira),
      images: linesToValues(images),
    };

    try {
      const data = await apiFetch<CreateRequestResponse>("/api/requests", {
        method: "POST",
        body: payload,
      });
      router.push(`/requests/${data.request.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const fe = err.fieldErrors ?? {};
        const mapped: FieldErrors = {};
        for (const field of [
          "description",
          "items",
          "budgetNaira",
          "quantity",
          "location",
          "deliveryDeadline",
          "instructions",
          "images",
        ] as const) {
          const messages = fe[field];
          if (messages && messages.length > 0) {
            mapped[field] = messages[0];
          }
        }
        setErrors(mapped);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      noValidate
    >
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          What do you need?
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputClass(Boolean(errors.description))} min-h-36 resize-y`}
          placeholder="Describe it in your own words — what, where to, and by when. Examples: groceries for a family of four; a black dress, size 12, under ₦80,000."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description}</p>
        )}
      </div>

      <div>
        <label htmlFor="items" className="mb-1 block text-sm font-medium">
          Specific items{" "}
          <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="items"
          value={items}
          onChange={(e) => setItems(e.target.value)}
          className={`${inputClass(Boolean(errors.items))} min-h-24 resize-y`}
          placeholder="One per line or separated by commas — e.g.&#10;Rice&#10;Chicken&#10;Cooking oil"
        />
        {errors.items && (
          <p className="mt-1 text-sm text-red-600">{errors.items}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="budgetNaira"
            className="mb-1 block text-sm font-medium"
          >
            Budget{" "}
            <span className="font-normal text-zinc-400">(₦, optional)</span>
          </label>
          <input
            id="budgetNaira"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={budgetNaira}
            onChange={(e) => setBudgetNaira(e.target.value)}
            className={inputClass(Boolean(errors.budgetNaira))}
            placeholder="50000"
          />
          {errors.budgetNaira && (
            <p className="mt-1 text-sm text-red-600">{errors.budgetNaira}</p>
          )}
        </div>

        <div>
          <label htmlFor="quantity" className="mb-1 block text-sm font-medium">
            Quantity{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="quantity"
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass(Boolean(errors.quantity))}
            placeholder="Family-size order, 2 pieces, 10 guests…"
          />
          {errors.quantity && (
            <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="location" className="mb-1 block text-sm font-medium">
            Location{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass(Boolean(errors.location))}
            placeholder="Lagos Island, Ikeja, Abuja…"
          />
          {errors.location && (
            <p className="mt-1 text-sm text-red-600">{errors.location}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="deliveryDeadline"
            className="mb-1 block text-sm font-medium"
          >
            Needed by{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="deliveryDeadline"
            type="date"
            value={deliveryDeadline}
            onChange={(e) => setDeliveryDeadline(e.target.value)}
            className={inputClass(Boolean(errors.deliveryDeadline))}
          />
          {errors.deliveryDeadline && (
            <p className="mt-1 text-sm text-red-600">
              {errors.deliveryDeadline}
            </p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="instructions"
          className="mb-1 block text-sm font-medium"
        >
          Additional instructions{" "}
          <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={`${inputClass(Boolean(errors.instructions))} min-h-24 resize-y`}
          placeholder="Not too spicy. Contact before delivery. Include a gift note…"
        />
        {errors.instructions && (
          <p className="mt-1 text-sm text-red-600">{errors.instructions}</p>
        )}
      </div>

      <div>
        <label htmlFor="images" className="mb-1 block text-sm font-medium">
          Image links{" "}
          <span className="font-normal text-zinc-400">
            (optional, one per line, up to 5)
          </span>
        </label>
        <textarea
          id="images"
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${inputClass(Boolean(errors.images))} min-h-20 resize-y`}
          placeholder="https://example.com/dress-similar.jpg"
        />
        {errors.images && (
          <p className="mt-1 text-sm text-red-600">{errors.images}</p>
        )}
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
        disabled={pending}
        className="w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Submitting request…" : "Submit request"}
      </button>
    </form>
  );
}