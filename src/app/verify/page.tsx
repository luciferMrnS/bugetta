"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

type VerifyState =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "verified" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "resent" };

function VerifyFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromLink = searchParams.get("email") ?? "";
  const tokenFromLink = searchParams.get("token") ?? "";

  const [email, setEmail] = useState(emailFromLink);
  const [state, setState] = useState<VerifyState>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!tokenFromLink || !emailFromLink) {
      return;
    }
    const timer = setTimeout(() => {
      setState({ kind: "verifying" });
      apiFetch<{ verified: boolean }>("/api/auth/verify", {
        method: "POST",
        body: { email: emailFromLink, token: tokenFromLink },
      })
        .then(() => setState({ kind: "verified" }))
        .catch((err) => {
          if (err instanceof ApiError && err.code === "VERIFICATION_EXPIRED") {
            setState({ kind: "expired" });
          } else if (
            err instanceof ApiError &&
            err.code === "VERIFICATION_INVALID"
          ) {
            setState({ kind: "invalid" });
          } else {
            setState({
              kind: "error",
              message:
                err instanceof ApiError ? err.message : "Something went wrong.",
            });
          }
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [tokenFromLink, emailFromLink]);

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const res = await apiFetch<{ sent: boolean }>("/api/auth/verify/resend", {
      method: "POST",
      body: { email },
    }).catch((err) => {
      setPending(false);
      if (err instanceof ApiError) {
        setState({ kind: "error", message: err.message });
      } else {
        setState({ kind: "error", message: "Something went wrong." });
      }
      return null;
    });
    if (res) {
      setPending(false);
      setState({ kind: "resent" });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verify your email
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Confirm the address on your Bugetta account.
          </p>
        </div>

        {state.kind === "verifying" && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Verifying your email…
          </p>
        )}

        {state.kind === "verified" && (
          <div className="flex flex-col gap-4">
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              Your email is verified. Thanks for confirming.
            </p>
            <button
              type="button"
              onClick={() => {
                router.push("/account");
                router.refresh();
              }}
              className="w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90"
            >
              Go to my account
            </button>
          </div>
        )}

        {(state.kind === "idle" ||
          state.kind === "invalid" ||
          state.kind === "expired" ||
          state.kind === "error" ||
          state.kind === "resent") && (
          <div className="flex flex-col gap-4">
            {state.kind === "expired" && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                That verification link has expired. Enter your email and
                we&apos;ll send a fresh one.
              </p>
            )}
            {state.kind === "invalid" && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                That verification link isn&apos;t valid. Enter your email and
                we&apos;ll send a fresh one.
              </p>
            )}
            {state.kind === "error" && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
              >
                {state.message}
              </p>
            )}

            <form onSubmit={handleResend} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-full bg-foreground px-6 py-3.5 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send me a new link"}
              </button>
            </form>

            {state.kind === "resent" && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                A new verification link is on its way. Check your inbox (and the
                spam folder).
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyFlow />
    </Suspense>
  );
}