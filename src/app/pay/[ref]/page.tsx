"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CHARGE_URL = "/api/payments/providers/sandbox/charge";

export default function SandboxCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [ref, setRef] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<"success" | "decline" | null>(null);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await params;
      const q = await searchParams;
      const t = Array.isArray(q.token) ? q.token[0] : q.token;
      if (!t) {
        if (!cancelled) setStatus("error");
        return;
      }
      if (!cancelled) {
        setRef(p.ref);
        setToken(t);
        setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, searchParams]);

  async function charge(outcome: "success" | "decline") {
    setBusy(outcome);
    setError("");
    try {
      const res = await fetch(CHARGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref, token, outcome }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message || "Payment could not be processed.");
        setBusy(null);
        return;
      }
      // Authoritative result already applied server-side; surface what happened.
      const status = body?.data?.payment?.status as string;
      if (status === "PAID") {
        router.push(`/requests/${body?.data?.payment?.requestId ?? ""}`);
      } else {
        setError(
          status === "FAILED"
            ? "Your payment was declined. You can try again from your request."
            : "Payment could not be completed.",
        );
        setBusy(null);
      }
    } catch {
      setError("Payment could not be processed.");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full flex-col gap-5 rounded-2xl border border-black/10 p-8 dark:border-white/10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            BUGETTA secure checkout
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Sandbox payment gateway · {ref || "…"}
          </p>
        </div>

        {status === "error" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            This payment link is invalid or incomplete.
          </p>
        )}

        {status === "ready" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Authorise this payment to confirm your order. This is a sandbox
              simulation — Pay completes, Fail declines.
            </p>
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => charge("success")}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy === "success" ? "Processing…" : "Pay"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => charge("decline")}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-black/15 px-4 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/5"
              >
                {busy === "decline" ? "Processing…" : "Fail"}
              </button>
            </div>
          </div>
        )}

        {status === "loading" && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
      </div>
    </main>
  );
}