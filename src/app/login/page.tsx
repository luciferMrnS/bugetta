"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";
import type { PublicUser } from "@/lib/auth/user";

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});

    try {
      await apiFetch<{ user: PublicUser }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      router.push("/account");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        const fe = err.fieldErrors ?? {};
        const mapped: FieldErrors = {};
        for (const field of ["email", "password"] as const) {
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
            Welcome back
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Log in to manage your requests.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
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
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-xl border bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 ${
                errors.password
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-black/10 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
              }`}
              placeholder="Your password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
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
            className="mt-1 w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          New to BUGETTA?{" "}
          <Link href="/register" className="font-medium underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}