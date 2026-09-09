"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface OfferingRef {
  id: string;
  title: string;
}

interface CatalogSyncEntryResult {
  offeringId: string;
  title: string;
  action: string;
  quantityAvailable: number | null;
  wasDeactivated: boolean;
  lowStockAlerted: boolean;
}

interface CatalogSyncView {
  id: string;
  reference: string;
  provider: string;
  status: string;
  summary: string | null;
  entries: CatalogSyncEntryResult[];
  error: string | null;
  createdAt: string;
}

type Payload = { runs: CatalogSyncView[] };

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PARTIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function CatalogSyncPanel({ offerings }: { offerings: OfferingRef[] }) {
  const [payload, setPayload] = useState("");
  const [runs, setRuns] = useState<CatalogSyncView[] | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await apiFetch<Payload>("/api/suppliers/catalog/sync");
      setRuns(data.runs);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Payload>("/api/suppliers/catalog/sync");
        setRuns(data.runs);
      } catch {
        setRuns([]);
      }
    })();
  }, []);

  function prefill() {
    const lines = offerings.map((o) => `${o.id}: 25`);
    setPayload(lines.join("\n"));
    setError(null);
    setResult(null);
  }

  function parseLines(text: string): Array<{ offeringId: string; quantityAvailable: number }> {
    const entries: Array<{ offeringId: string; quantityAvailable: number }> = [];
    for (const [index, rawLine] of text.split("\n").entries()) {
      const line = rawLine.trim();
      if (!line) continue;
      const sep = line.includes(":") ? line.indexOf(":") : line.indexOf(" ");
      if (sep === -1) {
        throw new Error(`Line ${index + 1}: expected "offeringId: quantity".`);
      }
      const offeringId = line.slice(0, sep).trim();
      const quantity = Number(line.slice(sep + 1).trim());
      if (!offeringId) {
        throw new Error(`Line ${index + 1}: missing offering id.`);
      }
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        throw new Error(`Line ${index + 1}: quantity must be a whole number ≥ 0.`);
      }
      entries.push({ offeringId, quantityAvailable: quantity });
    }
    if (entries.length === 0) {
      throw new Error("Enter at least one offering line.");
    }
    return entries;
  }

  async function sync() {
    if (pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const entries = parseLines(payload);
      const data = await apiFetch<{ run: CatalogSyncView }>(
        "/api/suppliers/catalog/sync",
        {
          method: "POST",
          body: { provider: "web", entries },
        },
      );
      setResult(
        `${data.run.reference} — ${data.run.summary} (${data.run.status.toLowerCase()})`,
      );
      setPayload("");
      await loadRuns();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === "VALIDATION_ERROR" || err.code === "EMPTY_SYNC"
            ? (err as { message: string }).message
            : err.message
          : err instanceof Error
            ? err.message
            : "Catalogue sync failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label="Catalogue sync"
      className="flex flex-col gap-4 rounded-2xl border border-black/10 p-5 dark:border-white/10"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Catalogue sync</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Push stock counts the way an ERP or inventory app would, one line per
          offering: <code className="font-mono">offeringId: quantity</code>.
          Zero deactivates the item; low stock raises an alert.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="sync-payload" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Stock entries
        </label>
        <textarea
          id="sync-payload"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={5}
          className="w-full resize-y rounded-xl border border-black/10 bg-transparent px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:border-foreground focus:ring-foreground/15 dark:border-white/15"
          placeholder={`${offerings[0]?.id ?? "offeringId"}: 25\n${offerings[1]?.id ?? "offeringId"}: 0`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={sync}
            disabled={pending || payload.trim() === ""}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Syncing…" : "Run sync"}
          </button>
          <button
            type="button"
            onClick={prefill}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Prefill with your offerings
          </button>
        </div>
        {result && <p className="text-sm text-emerald-600">{result}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {runs !== null && runs.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-black/5 pt-3 dark:border-white/5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            Recent syncs
          </span>
          <ul className="flex flex-col gap-1.5">
            {runs.slice(0, 5).map((run) => (
              <li key={run.id} className="flex flex-col gap-0.5 text-xs">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-zinc-500">{run.reference}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[run.status] ?? ""}`}
                  >
                    {run.status}
                  </span>
                  <span className="text-zinc-400">
                    {new Date(run.createdAt).toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">{run.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}