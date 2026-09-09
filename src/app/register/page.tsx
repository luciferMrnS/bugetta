"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { PublicUser } from "@/lib/auth/user";

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  adminBootstrapCode?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [adminBootstrapCode, setAdminBootstrapCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      await apiFetch<{ user: PublicUser }>("/api/auth/register", {
        method: "POST",
        body: {
          name,
          email,
          phone,
          password,
          ...(adminBootstrapCode ? { adminBootstrapCode } : {}),
        },
      });
      router.push("/account");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const fe = err.fieldErrors ?? {};
        const mapped: FieldErrors = {};
        for (const field of ["name", "email", "phone", "password"] as const) {
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set up your profile and start making requests.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Full name
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
              Email address
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
            <label htmlFor="phone" className="mb-1 block text-sm font-medium">
              Phone <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.phone
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="0800 000 0000"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
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

          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
            >
              {formError}
            </p>
          )}

          {showAdminCode ? (
            <div>
              <label
                htmlFor="adminBootstrapCode"
                className="mb-1 block text-sm font-medium"
              >
                Admin invite code
              </label>
              <input
                id="adminBootstrapCode"
                type="text"
                autoComplete="off"
                value={adminBootstrapCode}
                onChange={(e) => setAdminBootstrapCode(e.target.value)}
                className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                  errors.adminBootstrapCode
                    ? "border-red-500 focus:ring-red-500/30"
                    : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                }`}
                placeholder="Enter your invite code"
              />
              {errors.adminBootstrapCode && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.adminBootstrapCode}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdminCode(true)}
              className="w-fit text-left text-sm text-zinc-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Have an admin invite code?
            </button>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Creating account…" : "Create account"}
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