"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/client/apiClient";

interface MatchComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  available: boolean;
  explanation: string;
}

interface Rating {
  value: number | null;
  count: number;
  available: boolean;
}

interface SupplierHistory {
  assigned: number;
  fulfilled: number;
  onTime: number;
  declined: number;
  fulfillmentRate: number | null;
  onTimeRate: number | null;
}

interface OfferingMatch {
  id: string;
  title: string;
  priceNaira: number | null;
  categoryLabel: string;
}

interface SupplierMatch {
  supplierId: string;
  businessName: string;
  contactName: string;
  phone: string | null;
  whatsapp: string | null;
  serviceArea: string | null;
  categories: string[];
  categoryLabels: string[];
  rating: Rating;
  matchScore: number;
  scoreBand: "strong" | "good" | "possible";
  isRecommended: boolean;
  alreadyAssigned: boolean;
  ranking: number;
  breakdown: MatchComponent[];
  explanations: string[];
  offeringMatches: OfferingMatch[];
  history: SupplierHistory;
}

interface ExcludedSupplier {
  supplierId: string;
  businessName: string;
  status: string;
  reasons: string[];
}

interface RequestMatchSummary {
  id: string;
  reference: string;
  summary: string;
  category: string;
  categoryLabel: string;
  budgetNaira: number | null;
  location: string | null;
  deliveryDeadline: string | null;
}

interface MatchResult {
  request: RequestMatchSummary;
  recommendedSupplierId: string | null;
  matches: SupplierMatch[];
  excluded: ExcludedSupplier[];
  totalCandidates: number;
  suggestionThreshold: number;
  maxSemanticAdjustment: number;
  aiNote: string | null;
  generatedAt: string;
}

const BAND_CLASS: Record<SupplierMatch["scoreBand"], string> = {
  strong: "bg-emerald-600",
  good: "bg-amber-500",
  possible: "bg-sky-600",
};

function formatNaira(naira: number | null): string {
  if (naira === null) return "Not specified";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(naira);
}

function bandLabel(band: SupplierMatch["scoreBand"]): string {
  if (band === "strong") return "Strong match";
  if (band === "good") return "Good match";
  return "Possible match";
}

export function SupplierMatches({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoadError(null);
    setMatch(null);
    let cancelled = false;
    apiFetch<{ match: MatchResult }>(
      `/api/operations/requests/${requestId}/matches`,
    )
      .then((payload) => {
        if (!cancelled) setMatch(payload.match);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load supplier matches.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  useEffect(() => {
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = load();
    }, 0);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [load]);

  async function assign(supplier: SupplierMatch) {
    if (pending) return;
    const isOverride = !supplier.isRecommended;
    setPending(true);
    setFormError(null);
    try {
      await apiFetch(`/api/operations/requests/${requestId}/supplier`, {
        method: "POST",
        body: {
          supplierId: supplier.supplierId,
          override: isOverride ? true : undefined,
          overrideNote: isOverride && overrideNote.trim() ? overrideNote.trim() : undefined,
        },
      });
      setAssigned((prev) => ({
        ...prev,
        [supplier.supplierId]: isOverride ? "Override recorded." : "Assigned.",
      }));
      setOverrideTarget(null);
      setOverrideNote("");
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not assign supplier.",
      );
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return (
      <section aria-label="Supplier matches" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Supplier matches
        </h2>
        <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-400/5 dark:text-red-300">
          {loadError}
        </p>
        <button
          type="button"
          onClick={load}
          className="w-fit rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!match) {
    return (
      <section aria-label="Supplier matches" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Supplier matches
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Scoring eligible suppliers…
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Supplier matches" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Supplier matches</h2>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Deterministic ranking of approved suppliers for{" "}
        {match.request.categoryLabel}. Suppliers scoring below {match.suggestionThreshold}{" "}
        points are filtered out. Assignment is operator-driven; the top
        recommendation is only a suggestion.
      </p>

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600"
        >
          {formError}
        </p>
      )}

      {match.matches.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No suppliers currently match this request. Review the{" "}
          {match.excluded.length} excluded suppliers below or assign manually.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {match.matches.map((supplier) => (
            <li
              key={supplier.supplierId}
              className="flex flex-col gap-3 rounded-2xl border border-black/10 p-5 dark:border-white/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      #{supplier.ranking} {supplier.businessName}
                    </span>
                    {supplier.isRecommended && (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Recommended
                      </span>
                    )}
                    {supplier.alreadyAssigned && (
                      <span className="rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        Already assigned
                      </span>
                    )}
                    {assigned[supplier.supplierId] && (
                      <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                        {assigned[supplier.supplierId]}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {supplier.contactName}
                    {supplier.phone ? ` · ${supplier.phone}` : ""}
                    {supplier.whatsapp ? ` · WhatsApp ${supplier.whatsapp}` : ""}
                    {supplier.serviceArea ? ` · ${supplier.serviceArea}` : ""}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-2xl font-bold tabular-nums leading-none">
                    {supplier.matchScore}
                    <span className="text-sm font-medium text-zinc-400">/100</span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${BAND_CLASS[supplier.scoreBand]}`}
                  >
                    {bandLabel(supplier.scoreBand)}
                  </span>
                </div>
              </div>

              {supplier.offeringMatches.length > 0 && (
                <ul className="flex flex-col divide-y divide-black/5 text-xs text-zinc-600 dark:divide-white/5 dark:text-zinc-300">
                  {supplier.offeringMatches.map((offering) => (
                    <li
                      key={offering.id}
                      className="flex items-baseline justify-between gap-3 py-1.5"
                    >
                      <span className="truncate">
                        {offering.title} · {offering.categoryLabel}
                      </span>
                      <span className="font-medium">
                        {offering.priceNaira === null
                          ? "Unpriced"
                          : formatNaira(offering.priceNaira)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  {supplier.breakdown.map((component) => (
                    <div
                      key={component.key}
                      title={`${component.label}: ${component.contribution} pts`}
                      style={{ width: `${component.weight * 100}%` }}
                      className="h-2 bg-zinc-700/70 first:rounded-l-full last:rounded-r-full dark:bg-zinc-300/70"
                    />
                  ))}
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                  {supplier.breakdown.map((component) => (
                    <div key={component.key} className="flex items-baseline gap-2">
                      <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">
                        {component.label}
                      </dt>
                      <dd className="flex-1 truncate text-zinc-400 dark:text-zinc-500">
                        {component.explanation}
                      </dd>
                      <dd className="shrink-0 font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                        {component.contribution}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {!supplier.alreadyAssigned && !assigned[supplier.supplierId] && (
                <div className="flex flex-col gap-2">
                  {overrideTarget === supplier.supplierId ? (
                    <>
                      <textarea
                        aria-label="Override note"
                        value={overrideNote}
                        onChange={(e) => setOverrideNote(e.target.value)}
                        className="min-h-16 w-full resize-y rounded-xl border border-black/10 bg-transparent px-4 py-3 text-sm outline-none transition-colors focus:border-foreground focus:ring-2 focus:ring-foreground/15 dark:border-white/15"
                        placeholder={`This is not the top recommendation. Leave a note explaining the override (optional)…`}
                      />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => assign(supplier)}
                          className="flex-1 rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {pending
                            ? "Assigning…"
                            : `Assign ${supplier.businessName} (override)`}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideTarget(null);
                            setOverrideNote("");
                          }}
                          className="rounded-full px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (supplier.isRecommended) {
                          void assign(supplier);
                        } else {
                          setOverrideTarget(supplier.supplierId);
                        }
                      }}
                      className="self-start rounded-full bg-foreground px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {supplier.isRecommended ? "Assign supplier" : "Assign (override)"}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {match.excluded.length > 0 && (
        <details className="rounded-2xl border border-black/10 p-5 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-medium">
            {match.excluded.length} supplier
            {match.excluded.length === 1 ? "" : "s"} excluded
          </summary>
          <ul className="mt-3 flex flex-col divide-y divide-black/5 text-xs dark:divide-white/5">
            {match.excluded.map((supplier) => (
              <li key={supplier.supplierId} className="flex flex-col gap-1 py-2">
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {supplier.businessName}
                </span>
                <ul className="list-disc pl-4 text-zinc-500 dark:text-zinc-400">
                  {supplier.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}