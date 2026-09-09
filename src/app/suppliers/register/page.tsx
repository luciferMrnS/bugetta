"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { PublicUser } from "@/lib/auth/user";
import type { SupplierProfileOutput } from "@/lib/suppliers/serialize";
import { CATEGORY_GROUPS, CATEGORY_LABELS } from "@/lib/requests/categories";

interface FieldErrors {
  businessName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
}

export default function SupplierRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [description, setDescription] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleCategory(key: string) {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});

    if (password !== confirmPassword) {
      setErrors({ confirmPassword: "Passwords do not match." });
      setPending(false);
      return;
    }

    try {
      await apiFetch<{ user: PublicUser; supplier: SupplierProfileOutput }>(
        "/api/suppliers/register",
        {
          method: "POST",
          body: {
            name,
            email,
            password,
            businessName,
            contactName,
            phone,
            whatsapp,
            description,
            serviceArea,
            operatingHours,
            categories: selectedCategories,
          },
        },
      );
      router.push("/suppliers");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const fe = err.fieldErrors ?? {};
        const mapped: FieldErrors = {};
        for (const field of ["businessName", "email", "password", "name"] as const) {
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Become a BUGETTA supplier
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Tell us what you offer. We&apos;ll review and then match you with
            requests we&apos;re arranging.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div>
            <label
              htmlFor="businessName"
              className="mb-1 block text-sm font-medium"
            >
              Business name
            </label>
            <input
              id="businessName"
              type="text"
              autoComplete="organization"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.businessName
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="Ada's Kitchen"
            />
            {errors.businessName && (
              <p className="mt-1 text-sm text-red-600">
                {errors.businessName}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Your full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.name
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="Ada Obi"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Account email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.email
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.password
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="At least 8 characters"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1 block text-sm font-medium"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => {
                if (confirmPassword && password !== confirmPassword) {
                  setErrors((prev) => ({
                    ...prev,
                    confirmPassword: "Passwords do not match.",
                  }));
                } else {
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }
              }}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.confirmPassword
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="Re-enter your password"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-600">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="contactName"
              className="mb-1 block text-sm font-medium"
            >
              Contact name{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              id="contactName"
              type="text"
              autoComplete="name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              placeholder="Ada Obi"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium">
                Phone <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="0800 000 0000"
              />
            </div>
            <div>
              <label
                htmlFor="whatsapp"
                className="mb-1 block text-sm font-medium"
              >
                WhatsApp{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="whatsapp"
                type="tel"
                autoComplete="off"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="0800 111 1111"
              />
            </div>
          </div>

          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">
              What do you offer?{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              placeholder="Home-cooked local dishes, delivered across Ikeja…"
            />
          </div>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium">
              Categories{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </legend>
            <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
              Add the categories you supply. You can change these later from
              your catalogue.
            </p>
            <div className="flex flex-col gap-3">
              {CATEGORY_GROUPS.map((group) => (
                <div key={group.title} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {group.title}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {group.keys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={selectedCategories.includes(key)}
                        onClick={() => toggleCategory(key)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                          selectedCategories.includes(key)
                            ? "border-foreground bg-foreground text-background"
                            : "border-black/15 text-zinc-700 hover:bg-black/5 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
                        }`}
                      >
                        {CATEGORY_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="serviceArea"
                className="mb-1 block text-sm font-medium"
              >
                Service area{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="serviceArea"
                type="text"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Lagos — Ikeja, Yaba, Surulere"
              />
            </div>
            <div>
              <label
                htmlFor="operatingHours"
                className="mb-1 block text-sm font-medium"
              >
                Operating hours{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="operatingHours"
                type="text"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                placeholder="Mon–Sat, 9am–6pm"
              />
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
            disabled={pending}
            className="mt-1 w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit for review"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}