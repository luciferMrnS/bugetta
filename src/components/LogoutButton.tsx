"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setPending(true);
    setError(null);

    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setPending(false);
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not log out. Please try again.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        className="w-fit rounded-full border border-black/10 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:border-red-500/50 hover:text-red-600 disabled:opacity-60 dark:border-white/15 dark:text-zinc-200"
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}